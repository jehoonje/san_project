-- 관측소 단계: 동행 서클, 장소 건네기, 주간 잔향, 걷지 않은 날 한 줄, 다시 스치는 사람
--
-- 원칙
--  - 서클 안에서만 서로의 기록이 보입니다. 서클 밖으로는 아무것도 열리지 않습니다.
--  - 낯선 산책자의 재식별은 양쪽이 인사를 주고받은 뒤에만 가능합니다.
--  - 모든 테이블은 RLS로 자기 행 또는 자기 서클만 읽도록 막습니다.

-- ─────────────────────────────────────────────
-- 1. 재식별 토큰: 교차한 상대만 받아 가는 안정 키
--    계정 id에서 유도되지 않는 난수라, 유출돼도 계정을 되짚을 수 없습니다.
--    사용자가 언제든 새로 뽑으면 그동안 스친 사람들과의 연결이 끊깁니다.
-- ─────────────────────────────────────────────

alter table public.profiles
  add column if not exists signal_key uuid not null default gen_random_uuid();

-- 교차 기록에 상대의 토큰을 남겨 "몇 번째 스침"을 셉니다.
alter table public.encounters
  add column if not exists peer_key uuid;

create index if not exists encounters_user_peer_idx
  on public.encounters (user_id, peer_key)
  where peer_key is not null;

-- ─────────────────────────────────────────────
-- 2. 동행 서클
-- ─────────────────────────────────────────────

create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 24),
  -- 초대 코드: 8자리 대문자/숫자
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{8}$'),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  -- profiles 를 가리켜야 이름/사진을 한 번에 읽어 올 수 있습니다 (profiles.id = auth.users.id)
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

create index if not exists circle_members_user_idx
  on public.circle_members (user_id);

-- 서클 정원
create or replace function public.circle_is_full(p_circle uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) >= 8 from public.circle_members where circle_id = p_circle;
$$;

-- 내가 속한 서클인가 (RLS 안에서 재귀하지 않도록 security definer)
create or replace function public.is_circle_member(p_circle uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.circle_members
    where circle_id = p_circle and user_id = auth.uid()
  );
$$;

-- 저 사람과 같은 서클에 있는가
create or replace function public.shares_circle_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.circle_members mine
    join public.circle_members theirs on theirs.circle_id = mine.circle_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user
  );
$$;

alter table public.circles enable row level security;
alter table public.circle_members enable row level security;

drop policy if exists "circles select member" on public.circles;
create policy "circles select member" on public.circles
  for select using (public.is_circle_member(id) or created_by = auth.uid());

drop policy if exists "circles insert own" on public.circles;
create policy "circles insert own" on public.circles
  for insert with check (created_by = auth.uid());

drop policy if exists "circles update owner" on public.circles;
create policy "circles update owner" on public.circles
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "circles delete owner" on public.circles;
create policy "circles delete owner" on public.circles
  for delete using (created_by = auth.uid());

drop policy if exists "circle members select same circle" on public.circle_members;
create policy "circle members select same circle" on public.circle_members
  for select using (public.is_circle_member(circle_id));

-- 참여는 초대 코드를 아는 사람이 직접: 정원이 남아 있을 때만
drop policy if exists "circle members join self" on public.circle_members;
create policy "circle members join self" on public.circle_members
  for insert with check (
    user_id = auth.uid() and not public.circle_is_full(circle_id)
  );

-- 나가기는 자기 자신만
drop policy if exists "circle members leave self" on public.circle_members;
create policy "circle members leave self" on public.circle_members
  for delete using (user_id = auth.uid());

-- 초대 코드로 서클을 찾아 들어가는 길 (코드를 모르면 아무것도 보이지 않음)
create or replace function public.join_circle_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_circle uuid;
begin
  select id into v_circle
  from public.circles
  where invite_code = upper(btrim(p_code));

  if v_circle is null then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;

  if public.circle_is_full(v_circle) then
    raise exception 'circle_full' using errcode = 'P0001';
  end if;

  insert into public.circle_members (circle_id, user_id)
  values (v_circle, auth.uid())
  on conflict do nothing;

  return v_circle;
end;
$$;

revoke all on function public.join_circle_by_code(text) from public;
grant execute on function public.join_circle_by_code(text) to authenticated;

-- ─────────────────────────────────────────────
-- 3. 서클 안에서 서로의 걸음 보기
--    기존 "자기 것만" 정책은 그대로 두고, 같은 서클인 경우를 더합니다.
-- ─────────────────────────────────────────────

drop policy if exists "routes select circle" on public.routes;
create policy "routes select circle" on public.routes
  for select using (public.shares_circle_with(user_id));

drop policy if exists "route places select circle" on public.route_places;
create policy "route places select circle" on public.route_places
  for select using (public.shares_circle_with(user_id));

-- 서클에서 상대를 알아볼 이름과 얼굴만 열어 줍니다.
drop policy if exists "profiles select circle" on public.profiles;
create policy "profiles select circle" on public.profiles
  for select using (id = auth.uid() or public.shares_circle_with(id));

-- ─────────────────────────────────────────────
-- 4. 장소 건네기
-- ─────────────────────────────────────────────

create table if not exists public.place_handovers (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  category text not null check (
    category in ('cafe', 'restaurant', 'bar', 'park', 'shop', 'culture', 'etc')
  ),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  region_dong text check (region_dong is null or char_length(region_dong) <= 40),
  note text check (note is null or char_length(note) <= 80),
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  check (from_user <> to_user)
);

create index if not exists place_handovers_to_idx
  on public.place_handovers (to_user, sent_at desc);

alter table public.place_handovers enable row level security;

drop policy if exists "handovers select mine" on public.place_handovers;
create policy "handovers select mine" on public.place_handovers
  for select using (to_user = auth.uid() or from_user = auth.uid());

-- 같은 서클인 사람에게만 건넬 수 있습니다.
drop policy if exists "handovers insert to circle" on public.place_handovers;
create policy "handovers insert to circle" on public.place_handovers
  for insert with check (
    from_user = auth.uid() and public.shares_circle_with(to_user)
  );

-- 받은 사람이 열어 본 시각만 적습니다.
drop policy if exists "handovers update receiver" on public.place_handovers;
create policy "handovers update receiver" on public.place_handovers
  for update using (to_user = auth.uid()) with check (to_user = auth.uid());

drop policy if exists "handovers delete mine" on public.place_handovers;
create policy "handovers delete mine" on public.place_handovers
  for delete using (to_user = auth.uid() or from_user = auth.uid());

-- ─────────────────────────────────────────────
-- 5. 주간 잔향
-- ─────────────────────────────────────────────

create table if not exists public.weekly_echoes (
  -- profiles 를 가리켜야 서클이 건넨 잔향에 이름과 사진을 붙일 수 있습니다
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- 그 주 월요일 (KST 기준)
  week_start date not null,
  stats jsonb not null default '{}'::jsonb,
  body jsonb not null default '{}'::jsonb,
  model text not null,
  generated_at timestamptz not null default now(),
  -- 서클로 건넨 시각 (null이면 아직 나만 봄)
  shared_at timestamptz,
  primary key (user_id, week_start)
);

alter table public.weekly_echoes enable row level security;

drop policy if exists "echoes select own" on public.weekly_echoes;
create policy "echoes select own" on public.weekly_echoes
  for select using (user_id = auth.uid());

-- 건넨 잔향만 서클에 보입니다.
drop policy if exists "echoes select shared circle" on public.weekly_echoes;
create policy "echoes select shared circle" on public.weekly_echoes
  for select using (shared_at is not null and public.shares_circle_with(user_id));

drop policy if exists "echoes insert own" on public.weekly_echoes;
create policy "echoes insert own" on public.weekly_echoes
  for insert with check (user_id = auth.uid());

drop policy if exists "echoes update own" on public.weekly_echoes;
create policy "echoes update own" on public.weekly_echoes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "echoes delete own" on public.weekly_echoes;
create policy "echoes delete own" on public.weekly_echoes
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- 6. 걷지 않은 날 한 줄
-- ─────────────────────────────────────────────

create table if not exists public.day_notes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  body text not null check (char_length(btrim(body)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.day_notes enable row level security;

drop policy if exists "day notes select own" on public.day_notes;
create policy "day notes select own" on public.day_notes
  for select using (user_id = auth.uid());

drop policy if exists "day notes insert own" on public.day_notes;
create policy "day notes insert own" on public.day_notes
  for insert with check (user_id = auth.uid());

drop policy if exists "day notes update own" on public.day_notes;
create policy "day notes update own" on public.day_notes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "day notes delete own" on public.day_notes;
create policy "day notes delete own" on public.day_notes
  for delete using (user_id = auth.uid());
