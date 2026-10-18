// 관리자 읽기. 관리자 대시보드가 보는 조회이며 읽기만 한다.
// 관리자 뷰(v_admin_users·v_daily_active·v_retention_cohorts·v_economy_daily·v_catch_quality·v_spam_flags·v_import_log·
// v_dex_mismatch·v_events_recent·v_admin_letters·v_bounty_funnel_daily)와 사용자 이벤트 함수(fn_user_events)의 본문을
// 따른다. 뷰 본문의 관리자 판정(is_admin)은 호출하는 쪽이 isAdmin으로 먼저 한다.
// 행은 Postgres JSON 직렬화 그대로다. 시각은 '2030-01-01T00:00:00+00:00' 형식의 문자열, 날짜는 'yyyy-mm-dd', 수는 수다.
// 뷰가 순서를 정하지 않는 조회에는 같은 요청이 같은 순서를 받도록 정렬을 둔다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';

/** 사용자가 관리자 명부(admins)에 있는가. is_admin()과 같은 명부를 세션의 uid로 직접 조회한다 */
export async function isAdmin(db: Executor, uid: string): Promise<boolean> {
  const { rows } = await db.execute<{ admin: boolean }>(
    sql`select exists (select 1 from public.admins where user_id = ${uid}::uuid) as admin`);
  return rows[0].admin;
}

/** 조회문의 행을 order 순서의 JSON 배열로 읽는다. 행이 없으면 빈 배열이다 */
async function jsonRows(db: Executor, query: SQL, order: SQL): Promise<unknown[]> {
  const { rows } = await db.execute<{ rows: unknown[] }>(
    sql`select coalesce(json_agg(t order by ${order}), '[]'::json) as rows from (${query}) t`);
  return rows[0].rows;
}

/** day 열이 KST 오늘부터 days일 안인 행만 남긴다 */
function lastDays(db: Executor, days: number, body: SQL): Promise<unknown[]> {
  return jsonRows(db, sql`select * from (${body}) v
    where v.day >= (now() at time zone 'Asia/Seoul')::date - ${days - 1}::int`, sql`t.day desc`);
}

/** 사용자 명부. 인증 계정과 현재 저장 상태를 잇고, 최근 행동순으로 정렬하며 행동이 없는 계정은 뒤에 둔다 */
export function users(db: Executor): Promise<unknown[]> {
  return jsonRows(db, sql`select u.id as user_id, u.email, u.is_anonymous,
      u.created_at as signed_up_at, u.last_sign_in_at,
      c.gold, c.fame, c.boat, c.rod,
      c.data -> 'location' ->> 'kind' as location_kind,
      c.data -> 'location' ->> 'id' as location_id,
      c.data -> 'visited' as visited,
      c.restricted, c.version as save_version, c.updated_at as last_action_at
    from auth.users u
    left join public.saves_current c on c.user_id = u.id`, sql`t.last_action_at desc nulls last, t.user_id`);
}

/** 일별 활성. boot를 포함한 전 이벤트 기준 DAU와 직전 7일 WAU이며, 날짜는 KST 하루 축이고 최대 90일 창이다 */
export function dailyActive(db: Executor, days: number): Promise<unknown[]> {
  return lastDays(db, days, sql`with today as (
      select (now() at time zone 'Asia/Seoul')::date as d
    ),
    act as (
      select distinct user_id, (created_at at time zone 'Asia/Seoul')::date as day
      from public.events
    ),
    daily as (select day, count(*)::int as dau from act group by day),
    weekly as (
      select a.day, count(distinct a.user_id)::int as wau7
      from act a
      where exists (select 1 from act b
                    where b.user_id = a.user_id and b.day between a.day - 6 and a.day)
      group by a.day
    )
    select t.d::date - g as day,
           coalesce(dd.dau, 0) as dau,
           coalesce(ww.wau7, 0) as wau7
    from today t cross join generate_series(0, 89) g
    left join daily dd on dd.day = t.d::date - g
    left join weekly ww on ww.day = t.d::date - g`);
}

/** 리텐션 코호트. 첫 행동일 코호트별 D1·D3·D7·D14·D30 재방문률(%) */
export function retention(db: Executor): Promise<unknown[]> {
  return jsonRows(db, sql`with act as (
      select distinct user_id, (created_at at time zone 'Asia/Seoul')::date as day
      from public.events
    ),
    first_day as (
      select user_id, min(day) as cohort from act group by user_id
    )
    select f.cohort,
           count(*)::int as users,
           round(100.0 * count(*) filter (where exists (
             select 1 from act a where a.user_id = f.user_id and a.day = f.cohort + 1))
             / count(*), 1)::numeric as d1,
           round(100.0 * count(*) filter (where exists (
             select 1 from act a where a.user_id = f.user_id and a.day = f.cohort + 3))
             / count(*), 1)::numeric as d3,
           round(100.0 * count(*) filter (where exists (
             select 1 from act a where a.user_id = f.user_id and a.day = f.cohort + 7))
             / count(*), 1)::numeric as d7,
           round(100.0 * count(*) filter (where exists (
             select 1 from act a where a.user_id = f.user_id and a.day = f.cohort + 14))
             / count(*), 1)::numeric as d14,
           round(100.0 * count(*) filter (where exists (
             select 1 from act a where a.user_id = f.user_id and a.day = f.cohort + 30))
             / count(*), 1)::numeric as d30
    from first_day f
    group by f.cohort`, sql`t.cohort desc`);
}

/** 경제 일계. 골드 유입(sell·coupon)과 유출(upgradeRod·buyBoat·buyBait) 원장 */
export function economy(db: Executor, days: number): Promise<unknown[]> {
  return lastDays(db, days, sql`select (created_at at time zone 'Asia/Seoul')::date as day,
           count(*) filter (where type = 'sell')::int as sells,
           coalesce(sum((payload->>'gold')::numeric) filter (where type = 'sell'), 0) as sell_gold,
           coalesce(sum((payload->>'gold')::numeric) filter (where type = 'coupon'), 0) as coupon_gold,
           coalesce(sum((payload->>'cost')::numeric) filter (where type = 'upgradeRod'), 0) as rod_cost,
           coalesce(sum((payload->>'cost')::numeric) filter (where type = 'buyBoat'), 0) as boat_cost,
           coalesce(sum((payload->>'cost')::numeric) filter (where type = 'buyBait'), 0) as bait_cost
    from public.events
    where type in ('sell', 'coupon', 'upgradeRod', 'buyBoat', 'buyBait')
    group by day`);
}

/** 바운티 퍼널 일계. 네임드 수주, 도전권, 결투 승패, 토벌 보상, 일반 수주와 납품 */
export function bountyFunnel(db: Executor, days: number): Promise<unknown[]> {
  return lastDays(db, days, sql`select (created_at at time zone 'Asia/Seoul')::date as day,
           count(*) filter (where type = 'acceptQuest' and payload->>'questId' like '%-named-%')::int as named_accepts,
           count(*) filter (where type = 'ticket')::int as tickets,
           count(*) filter (where type = 'resolveChallenge' and payload->>'success' = 'true')::int as duels_won,
           count(*) filter (where type = 'resolveChallenge' and payload->>'success' = 'false')::int as duels_lost,
           count(*) filter (where type = 'deliverBounty' and payload->>'questId' like '%-named-%')::int as named_rewards,
           count(*) filter (where type = 'acceptQuest' and payload->>'questId' not like '%-named-%')::int as general_accepts,
           count(*) filter (where type = 'deliverBounty' and payload->>'questId' not like '%-named-%')::int as general_rewards
    from public.events
    where type in ('acceptQuest', 'ticket', 'resolveChallenge', 'deliverBounty')
    group by day`);
}

/** 캐치 품질 일계. 캐치 수, PERFECT 수, 미끼 사용 수, 평균 크기 */
export function catchQuality(db: Executor, days: number): Promise<unknown[]> {
  return lastDays(db, days, sql`select (created_at at time zone 'Asia/Seoul')::date as day,
           count(*)::int as catches,
           count(*) filter (where payload->>'judgment' = 'perfect')::int as perfect,
           count(*) filter (where payload->>'bait' is not null)::int as with_bait,
           round(avg((payload->>'size')::numeric), 1) as avg_size
    from public.events
    where type = 'catch'
    group by day`);
}

/** 연타·판정 플래그. 최근 7일 사용자별 캐치 수, 간격 2초 미만 캐치 수, PERFECT 비율과 30일 전체 평균 */
export function spamFlags(db: Executor): Promise<unknown[]> {
  return jsonRows(db, sql`with c as (
      select id, user_id, created_at, payload,
             lag(created_at) over (partition by user_id order by id) as prev_at
      from public.events
      where type = 'catch'
    ),
    per_user as (
      select user_id,
             count(*)::int as catches_7d,
             count(*) filter (where extract(epoch from created_at - prev_at) < 2)::int as fast_gap_7d,
             round(100.0 * count(*) filter (where payload->>'judgment' = 'perfect')
                   / greatest(count(*), 1), 1)::numeric as perfect_pct
      from c
      where created_at > now() - interval '7 day'
      group by user_id
    ),
    glob as (
      select round(100.0 * count(*) filter (where payload->>'judgment' = 'perfect')
                   / greatest(count(*), 1), 1)::numeric as perfect_pct_global
      from c
      where created_at > now() - interval '30 day'
    )
    select p.user_id, p.catches_7d, p.fast_gap_7d, p.perfect_pct, g.perfect_pct_global
    from per_user p cross join glob g`, sql`t.user_id`);
}

/** import 반입 기록. 이벤트 id 오름차순 */
export function imports(db: Executor): Promise<unknown[]> {
  return jsonRows(db, sql`select e.id, e.user_id, e.created_at,
           (e.payload->>'gold')::numeric as gold,
           (e.payload->>'fame')::numeric as fame
    from public.events e
    where e.type = 'import'`, sql`t.id`);
}

/** 도감과 이벤트의 차이. 도감 카운트가 catch 이벤트 수보다 큰 행 */
export function dexMismatch(db: Executor): Promise<unknown[]> {
  return jsonRows(db, sql`with evc as (
      select user_id, payload->>'fishId' as fish_id, payload->>'form' as form,
             count(*)::int as n
      from public.events
      where type = 'catch'
      group by 1, 2, 3
    )
    select r.user_id, r.fish_id, r.form,
           r.count as dex_count,
           coalesce(evc.n, 0) as event_count,
           r.count - coalesce(evc.n, 0) as missing_events
    from public.records r
    left join evc on evc.user_id = r.user_id
                 and evc.fish_id = r.fish_id
                 and evc.form = r.form
    where r.count > coalesce(evc.n, 0)`, sql`t.user_id, t.fish_id, t.form`);
}

/** 최근 이벤트 피드. 최신 80행, id 내림차순 */
export function recentEvents(db: Executor): Promise<unknown[]> {
  return jsonRows(db, sql`select id, user_id, type, payload, created_at
    from public.events
    order by id desc
    limit 80`, sql`t.id desc`);
}

/** 사용자 한 명의 최신 이벤트 limit건을 id 오름차순으로 읽는다. 건수는 1~2000으로 맞추고 없으면 500이다 */
export function userEvents(db: Executor, userId: string, limit: number | null): Promise<unknown[]> {
  return jsonRows(db, sql`select e.id, e.user_id, e.type, e.payload, e.created_at
    from public.events e
    where e.user_id = ${userId}::uuid
    order by e.id desc
    limit least(greatest(coalesce(${limit}::int, 500), 1), 2000)`, sql`t.id`);
}

/** 편지 목록. 영구 보관 표에서 최신순 */
export function letters(db: Executor): Promise<unknown[]> {
  return jsonRows(db, sql`select l.id, l.user_id, l.text, l.created_at
    from public.letters l`, sql`t.created_at desc, t.id desc`);
}
