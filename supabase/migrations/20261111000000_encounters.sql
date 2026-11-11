-- 근처 신호에서 서로 손을 흔들어 "교차"한 기록
-- 각 사용자는 자신이 받은 상대 카드와 주고받은 장소를 자기 행에만 저장합니다.
-- (상대 계정 정보는 저장하지 않습니다. 상대는 그날의 신호명으로만 남습니다.)

create table if not exists public.encounters (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  peer_call_sign text not null check (char_length(peer_call_sign) between 3 and 16),
  peer_card jsonb not null default '{}'::jsonb,
  match_percent smallint check (match_percent between 0 and 100),
  common_traits text[] not null default '{}',
  region text check (region is null or char_length(region) <= 40),
  met_at timestamptz not null default now(),
  gift_received jsonb,
  gift_sent jsonb,
  created_at timestamptz not null default now()
);

create index if not exists encounters_user_met_idx
  on public.encounters (user_id, met_at desc);

alter table public.encounters enable row level security;

drop policy if exists "encounters select own" on public.encounters;
create policy "encounters select own" on public.encounters
  for select using (auth.uid() = user_id);

drop policy if exists "encounters insert own" on public.encounters;
create policy "encounters insert own" on public.encounters
  for insert with check (auth.uid() = user_id);

drop policy if exists "encounters update own" on public.encounters;
create policy "encounters update own" on public.encounters
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "encounters delete own" on public.encounters;
create policy "encounters delete own" on public.encounters
  for delete using (auth.uid() = user_id);
