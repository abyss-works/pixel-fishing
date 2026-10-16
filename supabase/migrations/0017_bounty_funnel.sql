-- 바운티 퍼널 일계 (관리자 대시보드) — **순수 가산**, 구 코드·구 데이터에 무해하므로
-- ① 이 마이그레이션 먼저 실행 → ② 코드 배포 순서가 안전하다.
-- 0010 관리자 뷰와 같은 방식: postgres 소유(definer) 뷰 + 본문 is_admin() 게이트(비관리자 0행).
-- events는 콜드 아카이브가 7일이 지나면 옮기므로 이 뷰가 보는 범위도 최근 7일 안팎이다.
create or replace view public.v_bounty_funnel_daily as
select (created_at at time zone 'Asia/Seoul')::date as day,
       count(*) filter (where type = 'acceptQuest' and payload->>'questId' like '%-named-%')::int     as named_accepts,
       count(*) filter (where type = 'ticket')::int                                                   as tickets,
       count(*) filter (where type = 'resolveChallenge' and payload->>'success' = 'true')::int        as duels_won,
       count(*) filter (where type = 'resolveChallenge' and payload->>'success' = 'false')::int       as duels_lost,
       count(*) filter (where type = 'deliverBounty' and payload->>'questId' like '%-named-%')::int   as named_rewards,
       count(*) filter (where type = 'acceptQuest' and payload->>'questId' not like '%-named-%')::int as general_accepts,
       count(*) filter (where type = 'deliverBounty' and payload->>'questId' not like '%-named-%')::int as general_rewards
from public.events
where type in ('acceptQuest', 'ticket', 'resolveChallenge', 'deliverBounty')
  and public.is_admin()
group by day
order by day desc;

revoke all on public.v_bounty_funnel_daily from anon;
grant select on public.v_bounty_funnel_daily to authenticated;
