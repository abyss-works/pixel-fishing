-- 0034 되돌리기 — with_bait를 payload의 미끼 값이 있는 캐치 수로 되돌린다(0010 정의).
create or replace view public.v_catch_quality as
select (created_at at time zone 'Asia/Seoul')::date        as day,
       count(*)::int                                       as catches,
       count(*) filter (where payload->>'judgment' = 'perfect')::int as perfect,
       count(*) filter (where payload->>'bait' is not null)::int     as with_bait,
       round(avg((payload->>'size')::numeric), 1)          as avg_size
from public.events
where type = 'catch'
  and public.is_admin()
group by day
order by day desc;
