-- 개발 프로젝트의 SQL Editor에서만 사용하세요.
-- 아래 UUID를 현재 로그인한 사용자의 auth.users.id로 교체하세요.
-- select id, email from auth.users order by created_at desc;

begin;

do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-000000000000';
  v_route_1 uuid := gen_random_uuid();
  v_route_2 uuid := gen_random_uuid();
  v_route_3 uuid := gen_random_uuid();
begin
  if v_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'v_user_id를 실제 auth.users.id로 바꿔 주세요.';
  end if;

  insert into public.routes (
    id, user_id, title, coordinates, distance_meters,
    duration_seconds, started_at, ended_at
  ) values
  (
    v_route_1, v_user_id, '[DEV-ANALYSIS] 성수 카페 산책',
    '[[127.0530,37.5440],[127.0560,37.5450]]'::jsonb,
    520, 4200, now() - interval '8 days 5 hours', now() - interval '8 days 3 hours 50 minutes'
  ),
  (
    v_route_2, v_user_id, '[DEV-ANALYSIS] 연남 저녁',
    '[[126.9220,37.5600],[126.9250,37.5620]]'::jsonb,
    740, 5400, now() - interval '18 days 9 hours', now() - interval '18 days 7 hours 30 minutes'
  ),
  (
    v_route_3, v_user_id, '[DEV-ANALYSIS] 을지로 주말',
    '[[126.9910,37.5660],[126.9950,37.5680]]'::jsonb,
    810, 6200, now() - interval '42 days 8 hours', now() - interval '42 days 6 hours 16 minutes'
  );

  insert into public.route_places (
    route_id, user_id, name, category, lat, lng,
    accuracy_meters, dwell_minutes, source, saved_at,
    place_id, region_dong
  ) values
  (v_route_1, v_user_id, 'DEV 성수 카페 A', 'cafe', 37.5446, 127.0559, 10, 65, 'manual', now() - interval '8 days 4 hours', 'dev-analysis-cafe-a', '성수동2가'),
  (v_route_1, v_user_id, 'DEV 성수 카페 B', 'cafe', 37.5437, 127.0524, 12, 48, 'manual', now() - interval '8 days 2 hours', 'dev-analysis-cafe-b', '성수동2가'),
  (v_route_1, v_user_id, 'DEV 서울숲', 'park', 37.5444, 127.0374, 9, 40, 'manual', now() - interval '7 days 23 hours', 'dev-analysis-park-a', '성수동1가'),
  (v_route_2, v_user_id, 'DEV 연남 카페 A', 'cafe', 37.5622, 126.9237, 11, 80, 'manual', now() - interval '18 days 8 hours', 'dev-analysis-cafe-c', '연남동'),
  (v_route_2, v_user_id, 'DEV 연남 식당 A', 'restaurant', 37.5608, 126.9245, 13, 70, 'manual', now() - interval '18 days 6 hours', 'dev-analysis-restaurant-a', '연남동'),
  (v_route_2, v_user_id, 'DEV 연남 식당 B', 'restaurant', 37.5599, 126.9218, 14, 55, 'manual', now() - interval '17 days 23 hours', 'dev-analysis-restaurant-b', '연남동'),
  (v_route_3, v_user_id, 'DEV 을지로 카페 A', 'cafe', 37.5665, 126.9927, 10, 52, 'manual', now() - interval '42 days 7 hours', 'dev-analysis-cafe-d', '을지로동'),
  (v_route_3, v_user_id, 'DEV 을지로 식당 A', 'restaurant', 37.5674, 126.9945, 15, 90, 'manual', now() - interval '42 days 5 hours', 'dev-analysis-restaurant-c', '을지로동');
end $$;

commit;
