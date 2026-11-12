begin;

delete from public.analysis_reports
where user_id in (
  select distinct user_id
  from public.routes
  where title like '[DEV-ANALYSIS]%'
);

delete from public.place_insights
where place_id like 'dev-analysis-%';

delete from public.route_places
where route_id in (
  select id
  from public.routes
  where title like '[DEV-ANALYSIS]%'
);

delete from public.routes
where title like '[DEV-ANALYSIS]%';

commit;
