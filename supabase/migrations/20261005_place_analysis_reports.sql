begin;

create table if not exists public.analysis_reports (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fingerprint text not null,
  stats jsonb not null default '{}'::jsonb,
  report jsonb not null default '{}'::jsonb,
  model text not null,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.analysis_reports enable row level security;

revoke all on table public.analysis_reports from anon;
grant select, insert, update, delete on table public.analysis_reports to authenticated;

 drop policy if exists analysis_reports_select_own on public.analysis_reports;
create policy analysis_reports_select_own
on public.analysis_reports
for select
to authenticated
using (user_id = auth.uid());

 drop policy if exists analysis_reports_insert_own on public.analysis_reports;
create policy analysis_reports_insert_own
on public.analysis_reports
for insert
to authenticated
with check (user_id = auth.uid());

 drop policy if exists analysis_reports_update_own on public.analysis_reports;
create policy analysis_reports_update_own
on public.analysis_reports
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

 drop policy if exists analysis_reports_delete_own on public.analysis_reports;
create policy analysis_reports_delete_own
on public.analysis_reports
for delete
to authenticated
using (user_id = auth.uid());

create index if not exists route_places_user_saved_at_idx
  on public.route_places (user_id, saved_at desc);

create index if not exists route_places_place_id_idx
  on public.route_places (place_id)
  where place_id is not null;

commit;
