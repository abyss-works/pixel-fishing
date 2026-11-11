-- 캐치 품질 일계의 슬롯 효과 열 — with_bait가 미끼 슬롯 또는 도시락 슬롯의 요리 id가 payload에 실린 캐치를 센다.
-- 서버가 캐치 이벤트에 활성 슬롯의 요리 id를 bait(미끼 슬롯), lunch(도시락 슬롯) 키로 남긴다. 열 이름과 집합은 그대로다.
-- 뷰 정의만 바꾸는 가산 변경이다 — 이 파일 먼저 실행 → 코드 배포가 안전하다.
create or replace view public.v_catch_quality as
select (created_at at time zone 'Asia/Seoul')::date        as day,
       count(*)::int                                       as catches,
       count(*) filter (where payload->>'judgment' = 'perfect')::int as perfect,
       count(*) filter (where payload ? 'bait' or payload ? 'lunch')::int as with_bait,
       round(avg((payload->>'size')::numeric), 1)          as avg_size
from public.events
where type = 'catch'
  and public.is_admin()
group by day
order by day desc;
