// 밸런스 라이브 지표 읽기. 관리자 대시보드가 보는 조회이며 읽기만 한다.
// 지표의 정의는 측정 명령의 라이브 조회와 같다. 판정 분포, 체류 해역, 도감 진행, 배·낚싯대 분포, 골드 분위와 흐름,
// 일일 활성, 이탈 지점, 바운티 퍼널, 연타·PERFECT 이상치, 명성 게이트 정체를 한 번의 조회문으로 읽는다.
// 한 조회문이므로 모든 지표가 같은 시점의 데이터를 본다. 이벤트는 최근 7일만 남아 있어 조회 기간은 1~7일이다.
// 기간은 지금부터 거슬러 올라가는 days일(24시간 단위)이고 KST 날짜 경계에 맞추지 않는다. 일일 활성의 첫 날은 그 구간에 든 시각만 센다.
//
// 집계에서 빼는 계정은 두 종류이고, 사용자 수 지표와 이벤트 지표에서 같게 뺀다.
//  - 제재된 계정(저장 상태의 restricted)
//  - 골드와 명성이 모두 0인 익명 계정. 빈 익명 계정은 별도 정리 작업이 주기적으로 지우므로,
//    지워지기 전과 후의 집계가 같도록 처음부터 뺀다.
// 저장 행이 없는 계정은 위 조건을 판정할 수 없어 빼지 않는다.
//
// 응답은 집계값뿐이고 사용자 식별자와 이메일을 담지 않는다. 키 이름은 클라이언트 API 계약의 BalanceLive와 같다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { BOATS } from '../../src/game/content/boats.js';

/** 이벤트 보관 기간(일). 조회 기간의 상한이자 기본값이다 */
const MAX_DAYS = 7;
/** 이탈로 보는 미접속 기간(일). 조회 기간과 무관하다 */
const CHURN_DAYS = 7;

/** 조회문의 행을 order 순서의 JSON 배열로 모은다. 행이 없으면 빈 배열이다 */
const list = (query: SQL, order: SQL): SQL =>
  sql`(select coalesce(json_agg(t order by ${order}), '[]'::json) from (${query}) t)`;

/** 배 단계별 가격과 명성 하한. 배 콘텐츠가 정본이다 */
const boatGates = sql.join(
  BOATS.map(b => sql`(${b.tier}::int, ${b.price}::bigint, ${b.fameReq}::bigint)`), sql`, `);

/**
 * 밸런스 라이브 지표 전체를 읽는다. days는 이벤트 지표의 기간이다. 없으면 7일이고 1~7일로 맞춘다.
 * 도감, 배, 낚싯대, 골드 분위, 이탈, 명성 게이트는 현재 저장 상태라 기간과 무관하다.
 */
export async function balanceLive(db: Executor, days: number | null): Promise<unknown> {
  const period = Math.min(Math.max(days ?? MAX_DAYS, 1), MAX_DAYS);
  const { rows } = await db.execute<{ live: unknown }>(sql`
    with skipped as (
      select c.user_id
      from public.saves_current c
      left join auth.users u on u.id = c.user_id
      where c.restricted or (coalesce(u.is_anonymous, false) and c.gold = 0 and c.fame = 0)
    ),
    pop as (
      select c.boat, c.rod, c.gold, c.fame, c.updated_at
      from public.saves_current c
      where not exists (select 1 from skipped s where s.user_id = c.user_id)
    ),
    ev as (
      select e.id, e.user_id, e.type, e.payload, e.created_at
      from public.events e
      where e.created_at > now() - make_interval(days => ${period}::int)
        and not exists (select 1 from skipped s where s.user_id = e.user_id)
    )
    select json_build_object(
      'judgment', ${list(sql`
        select coalesce(payload->>'judgment', '?') as judgment, count(*)::int as catches,
               round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
        from ev where type = 'catch' group by 1`, sql`t.catches desc, t.judgment`)},
      'spots', ${list(sql`
        select payload->>'spot' as spot, count(*)::int as catches, count(distinct user_id)::int as users
        from ev where type = 'catch' group by 1`, sql`t.catches desc, t.spot`)},
      'dexBuckets', ${list(sql`
        select width_bucket(d.n, 0, 90, 9) * 10 - 10 as "fromSpecies", count(*)::int as users
        from (select r.user_id, count(*) as n
              from public.records r
              where r.form = 'normal' and r.count > 0
                and not exists (select 1 from skipped s where s.user_id = r.user_id)
              group by r.user_id) d
        group by 1`, sql`t."fromSpecies"`)},
      'boats', ${list(sql`
        select boat, count(*)::int as users from pop group by boat`, sql`t.boat`)},
      'rodBuckets', ${list(sql`
        select width_bucket(rod, 1, 31, 6) * 5 - 4 as "fromLevel", count(*)::int as users
        from pop group by 1`, sql`t."fromLevel"`)},
      'gold', (select json_build_object('p25', g.q[1], 'p50', g.q[2], 'p75', g.q[3], 'p90', g.q[4], 'max', g.m)
               from (select percentile_disc(array[0.25, 0.5, 0.75, 0.9]) within group (order by gold) as q,
                            max(gold) as m
                     from pop) g),
      'goldFlow', (select json_build_object(
          'sellGold', coalesce(sum((payload->>'gold')::numeric) filter (where type = 'sell'), 0),
          'couponGold', coalesce(sum((payload->>'gold')::numeric) filter (where type = 'coupon'), 0),
          'mailGold', coalesce(sum((payload->>'gold')::numeric) filter (where type = 'claimMail'), 0),
          'rodCost', coalesce(sum((payload->>'cost')::numeric) filter (where type = 'upgradeRod'), 0),
          'boatCost', coalesce(sum((payload->>'cost')::numeric) filter (where type = 'buyBoat'), 0),
          'baitCost', coalesce(sum((payload->>'cost')::numeric) filter (where type = 'buyBait'), 0))
        from ev),
      'dau', ${list(sql`
        select (created_at at time zone 'Asia/Seoul')::date as day, count(distinct user_id)::int as dau
        from ev group by 1`, sql`t.day`)},
      'churn', ${list(sql`
        select boat, count(*)::int as users, round(avg(fame)) as "avgFame", round(avg(rod), 1) as "avgRod"
        from pop where updated_at < now() - make_interval(days => ${CHURN_DAYS}::int)
        group by boat`, sql`t.boat`)},
      'bountyFunnel', (select json_build_object(
          'namedAccepts', count(*) filter (where type = 'acceptQuest' and payload->>'questId' like '%-named-%')::int,
          'tickets', count(*) filter (where type = 'ticket')::int,
          'duelsWon', count(*) filter (where type = 'resolveChallenge' and payload->>'success' = 'true')::int,
          'duelsLost', count(*) filter (where type = 'resolveChallenge' and payload->>'success' = 'false')::int,
          'generalAccepts', count(*) filter (where type = 'acceptQuest' and payload->>'questId' not like '%-named-%')::int,
          'delivered', count(*) filter (where type = 'deliverBounty')::int)
        from ev),
      'anomalies', (select json_build_object(
          'fastGaps', count(*) filter (where extract(epoch from c.created_at - c.prev_at) < 2)::int,
          'fastUsers', count(distinct c.user_id) filter (where extract(epoch from c.created_at - c.prev_at) < 2)::int,
          'perfectPct', round(100.0 * count(*) filter (where c.j = 'perfect') / nullif(count(*), 0), 1))
        from (select user_id, payload->>'judgment' as j, created_at,
                     lag(created_at) over (partition by user_id order by id) as prev_at
              from ev where type = 'catch') c),
      'fameGateStuck', ${list(sql`
        select g.tier as "nextBoat", count(*)::int as users
        from pop c
        join (values ${boatGates}) as g(tier, price, fame_req) on g.tier = c.boat + 1
        where c.gold >= g.price and c.fame < g.fame_req
        group by g.tier`, sql`t."nextBoat"`)}
    ) as live`);
  return rows[0].live;
}
