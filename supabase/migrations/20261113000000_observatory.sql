-- 관측소 단계: 동행 서클, 장소 건네기, 주간 잔향, 걷지 않은 날 한 줄, 다시 스치는 사람
--
-- 이 파일 하나만 실행하면 됩니다. 몇 번을 실행해도 결과가 같고,
-- 이 파일의 이전 버전을 이미 실행했더라도 그대로 다시 실행하면 정리됩니다.
--
-- 원칙
--  - 원래 있던 테이블(routes, route_places, profiles)의 열람 범위는 넓히지 않습니다.
--    서클에 보여 줄 것은 전용 함수가 필요한 칸만 골라 내어 줍니다.
--  - 서클에서는 "둘이 같은 서클에 있게 된 뒤"의 걸음만 서로에게 보입니다.
--  - 낯선 산책자의 재식별은 양쪽이 인사를 주고받은 뒤에만, 그리고 꺼 둘 수 있습니다.
--  - 새로 만드는 테이블은 모두 RLS로 자기 행 또는 자기 서클만 읽도록 막습니다.

-- ─────────────────────────────────────────────
-- 0. 이전 버전 정리
--    이전 버전은 기존 테이블에 서클용 열람 정책을 더했습니다.
--    profiles 는 행 전체(이메일 포함)가 열리고, routes 는 내 목록·지도 통계에
--    서클 사람의 기록이 섞일 수 있어 거둬들입니다.
-- ─────────────────────────────────────────────

drop policy if exists "routes select circle" on public.routes;
drop policy if exists "route places select circle" on public.route_places;
drop policy if exists "profiles select circle" on public.profiles;

-- 재식별 토큰은 profiles 가 아니라 본인만 읽는 전용 테이블에 둡니다 (1번).
alter table public.profiles drop column if exists signal_key;

-- ─────────────────────────────────────────────
-- 1. 재식별 토큰: 교차한 상대만 받아 가는 값
--    계정 id에서 유도되지 않는 난수라, 이 값으로 계정을 되짚을 수 없습니다.
--    꺼 두면(enabled = false) 건네지도 받아 적지도 않습니다.
-- ─────────────────────────────────────────────

create table if not exists public.signal_keys (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  enabled boolean not null default true,
  rotated_at timestamptz not null default now()
);

alter table public.signal_keys enable row level security;

drop policy if exists "signal keys select own" on public.signal_keys;
create policy "signal keys select own" on public.signal_keys
  for select using (user_id = auth.uid());

drop policy if exists "signal keys insert own" on public.signal_keys;
create policy "signal keys insert own" on public.signal_keys
  for insert with check (user_id = auth.uid());

drop policy if exists "signal keys update own" on public.signal_keys;
create policy "signal keys update own" on public.signal_keys
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "signal keys delete own" on public.signal_keys;
create policy "signal keys delete own" on public.signal_keys
  for delete using (user_id = auth.uid());

-- 교차 기록에 상대의 토큰을 남겨 "몇 번째 스침"을 셉니다.
-- (encounters 테이블은 20261111000000_encounters.sql 에서 만듭니다. 아직 없으면 건너뜁니다.)
do $$
begin
  if to_regclass('public.encounters') is not null then
    alter table public.encounters add column if not exists peer_key uuid;
    create index if not exists encounters_user_peer_idx
      on public.encounters (user_id, peer_key)
      where peer_key is not null;
  end if;
end $$;

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
  user_id uuid not null default auth.uid(),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

-- 이전 버전은 profiles 를 가리켰습니다. 프로필 행이 없는 계정도 들어올 수 있게 auth.users 로 맞춥니다.
alter table public.circle_members
  drop constraint if exists circle_members_user_id_fkey;
alter table public.circle_members
  add constraint circle_members_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

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

-- 내가 만든 서클인가
create or replace function public.is_circle_owner(p_circle uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.circles
    where id = p_circle and created_by = auth.uid()
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
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user
      and theirs.user_id <> mine.user_id
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

-- 초대 코드를 바꾸는 것은 만든 사람만
drop policy if exists "circles update owner" on public.circles;
create policy "circles update owner" on public.circles
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "circles delete owner" on public.circles;
create policy "circles delete owner" on public.circles
  for delete using (created_by = auth.uid());

drop policy if exists "circle members select same circle" on public.circle_members;
create policy "circle members select same circle" on public.circle_members
  for select using (public.is_circle_member(circle_id));

-- 직접 넣을 수 있는 것은 서클을 만든 사람이 자기 자신을 넣을 때뿐입니다.
-- 그 밖에는 모두 아래의 초대 코드 함수로만 들어옵니다.
-- (내보낸 사람이 서클 id 만으로 다시 들어오지 못하게)
drop policy if exists "circle members join self" on public.circle_members;
create policy "circle members join self" on public.circle_members
  for insert with check (
    user_id = auth.uid()
    and not public.circle_is_full(circle_id)
    and public.is_circle_owner(circle_id)
  );

-- 나가기는 자기 자신, 내보내기는 서클을 만든 사람
drop policy if exists "circle members leave self" on public.circle_members;
drop policy if exists "circle members leave or remove" on public.circle_members;
create policy "circle members leave or remove" on public.circle_members
  for delete using (user_id = auth.uid() or public.is_circle_owner(circle_id));

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
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select id into v_circle
  from public.circles
  where invite_code = upper(btrim(p_code));

  if v_circle is null then
    raise exception 'circle_not_found' using errcode = 'P0002';
  end if;

  -- 이미 들어와 있으면 그대로
  if exists (
    select 1 from public.circle_members
    where circle_id = v_circle and user_id = auth.uid()
  ) then
    return v_circle;
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

-- 서클 사람들의 이름과 얼굴만 내어 줍니다 (profiles 의 다른 칸은 열지 않습니다).
create or replace function public.circle_roster()
returns table (
  circle_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.circle_id, m.user_id, p.display_name, p.avatar_url, m.joined_at
  from public.circle_members mine
  join public.circle_members m on m.circle_id = mine.circle_id
  left join public.profiles p on p.id = m.user_id
  where mine.user_id = auth.uid()
  order by m.joined_at;
$$;

-- ─────────────────────────────────────────────
-- 3. 서클 안에서 서로의 걸음 보기
--    둘이 같은 서클에 있게 된 시각 이후에 시작한 걸음만 내어 줍니다.
--    그 전의 기록은 서클에 들어와도 보이지 않고, 서클에서 나가면 아무것도 보이지 않습니다.
-- ─────────────────────────────────────────────

create or replace function public.circle_walks(p_user uuid, p_limit integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with since as (
    select min(greatest(mine.joined_at, theirs.joined_at)) as shared_from
    from public.circle_members mine
    join public.circle_members theirs on theirs.circle_id = mine.circle_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user
      and theirs.user_id <> mine.user_id
  ),
  walks as (
    select r.id, r.title, r.coordinates, r.distance_meters, r.duration_seconds,
           r.started_at, r.ended_at, r.created_at
    from public.routes r
    cross join since
    where since.shared_from is not null
      and r.user_id = p_user
      and r.started_at >= since.shared_from
    order by r.started_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 40)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', w.id,
        'title', w.title,
        'coordinates', w.coordinates,
        'distance_meters', w.distance_meters,
        'duration_seconds', w.duration_seconds,
        'started_at', w.started_at,
        'ended_at', w.ended_at,
        'created_at', w.created_at,
        'route_places', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', p.id,
                'name', p.name,
                'category', p.category,
                'lat', p.lat,
                'lng', p.lng,
                'accuracy_meters', p.accuracy_meters,
                'dwell_minutes', p.dwell_minutes,
                'source', p.source,
                'saved_at', p.saved_at,
                'created_at', p.created_at,
                'place_id', p.place_id,
                'region_dong', p.region_dong
              )
              order by p.saved_at
            )
            from public.route_places p
            where p.route_id = w.id
          ),
          '[]'::jsonb
        )
      )
      order by w.started_at desc
    ),
    '[]'::jsonb
  )
  from walks w;
$$;

-- ─────────────────────────────────────────────
-- 4. 장소 건네기
-- ─────────────────────────────────────────────

create table if not exists public.place_handovers (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid(),
  to_user uuid not null,
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

alter table public.place_handovers
  drop constraint if exists place_handovers_from_user_fkey;
alter table public.place_handovers
  add constraint place_handovers_from_user_fkey
  foreign key (from_user) references auth.users (id) on delete cascade;

alter table public.place_handovers
  drop constraint if exists place_handovers_to_user_fkey;
alter table public.place_handovers
  add constraint place_handovers_to_user_fkey
  foreign key (to_user) references auth.users (id) on delete cascade;

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

-- 받은 사람이 바꿀 수 있는 것은 열어 본 시각뿐 (장소 내용은 보낸 그대로)
create or replace function public.place_handovers_keep_content()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.id := old.id;
  new.from_user := old.from_user;
  new.to_user := old.to_user;
  new.name := old.name;
  new.category := old.category;
  new.lat := old.lat;
  new.lng := old.lng;
  new.region_dong := old.region_dong;
  new.note := old.note;
  new.sent_at := old.sent_at;
  return new;
end;
$$;

drop trigger if exists place_handovers_keep_content on public.place_handovers;
create trigger place_handovers_keep_content
  before update on public.place_handovers
  for each row execute function public.place_handovers_keep_content();

-- ─────────────────────────────────────────────
-- 5. 주간 잔향
-- ─────────────────────────────────────────────

create table if not exists public.weekly_echoes (
  user_id uuid not null default auth.uid(),
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

alter table public.weekly_echoes
  drop constraint if exists weekly_echoes_user_id_fkey;
alter table public.weekly_echoes
  add constraint weekly_echoes_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

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

-- ─────────────────────────────────────────────
-- 7. 권한
--    로그인한 사용자만 씁니다. 함수는 로그인하지 않은 호출을 받지 않습니다.
-- ─────────────────────────────────────────────

grant select, insert, update, delete on
  public.signal_keys,
  public.circles,
  public.circle_members,
  public.place_handovers,
  public.weekly_echoes,
  public.day_notes
to authenticated;

revoke all on function public.join_circle_by_code(text) from public, anon;
revoke all on function public.circle_roster() from public, anon;
revoke all on function public.circle_walks(uuid, integer) from public, anon;

grant execute on function public.join_circle_by_code(text) to authenticated;
grant execute on function public.circle_roster() to authenticated;
grant execute on function public.circle_walks(uuid, integer) to authenticated;
