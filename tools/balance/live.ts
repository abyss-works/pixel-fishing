// 라이브 지표 — 실제 플레이 기록에서 읽는다. 조회만 하고 아무것도 쓰지 않는다.
// 관리자 뷰는 관리자 판정(is_admin)이 걸려 있어 직접 연결에서는 비므로, 같은 계산을 원본 표에 직접 한다.
// 이벤트는 최근 7일만 남아 있다(이전은 콜드 아카이브).
import pg from 'pg';
import { BOATS } from '../../src/game/content/boats';

/** 지표 이름 → 조회문. 결과 행을 그대로 표로 찍는다 */
export const LIVE_QUERIES: Record<string, string> = {
  '판정 분포(7일)': `select coalesce(payload->>'judgment', '?') as judgment, count(*)::int as catches,
      round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
    from public.events where type = 'catch' and created_at > now() - interval '7 days'
    group by 1 order by 2 desc`,
  '체류 해역(7일 캐치)': `select payload->>'spot' as spot, count(*)::int as catches, count(distinct user_id)::int as users
    from public.events where type = 'catch' and created_at > now() - interval '7 days'
    group by 1 order by 2 desc`,
  '도감 진행(일반 폼 발견 어종 수)': `select width_bucket(n, 0, 90, 9) * 10 - 10 as from_species, count(*)::int as users
    from (select user_id, count(*) as n from public.records where form = 'normal' and count > 0 group by user_id) t
    group by 1 order by 1`,
  '배 단계 분포': `select boat, count(*)::int as users from public.saves_current where not restricted group by 1 order by 1`,
  '낚싯대 레벨 분포': `select width_bucket(rod, 1, 31, 6) * 5 - 4 as from_level, count(*)::int as users
    from public.saves_current where not restricted group by 1 order by 1`,
  '골드 잔고 분위': `select percentile_disc(array[0.25, 0.5, 0.75, 0.9]) within group (order by gold) as p25_p50_p75_p90,
      max(gold) as max from public.saves_current where not restricted`,
  '골드 흐름(7일)': `select
      coalesce(sum((payload->>'gold')::numeric) filter (where type = 'sell'), 0) as sell_gold,
      coalesce(sum((payload->>'gold')::numeric) filter (where type = 'coupon'), 0) as coupon_gold,
      coalesce(sum((payload->>'cost')::numeric) filter (where type = 'upgradeRod'), 0) as rod_cost,
      coalesce(sum((payload->>'cost')::numeric) filter (where type = 'buyBoat'), 0) as boat_cost,
      coalesce(sum((payload->>'cost')::numeric) filter (where type = 'buyBait'), 0) as bait_cost
    from public.events where created_at > now() - interval '7 days'`,
  '일일 활성(7일)': `select (created_at at time zone 'Asia/Seoul')::date as day, count(distinct user_id)::int as dau
    from public.events where created_at > now() - interval '7 days' group by 1 order by 1`,
  '이탈 지점(7일 이상 미접속)': `select boat, count(*)::int as users, round(avg(fame)) as avg_fame, round(avg(rod), 1) as avg_rod
    from public.saves_current where not restricted and updated_at < now() - interval '7 days' group by 1 order by 1`,
  '바운티 퍼널(7일)': `select
      count(*) filter (where type = 'acceptQuest' and payload->>'questId' like '%-named-%')::int as named_accepts,
      count(*) filter (where type = 'ticket')::int as tickets,
      count(*) filter (where type = 'resolveChallenge' and payload->>'success' = 'true')::int as duels_won,
      count(*) filter (where type = 'resolveChallenge' and payload->>'success' = 'false')::int as duels_lost,
      count(*) filter (where type = 'acceptQuest' and payload->>'questId' not like '%-named-%')::int as general_accepts,
      count(*) filter (where type = 'deliverBounty')::int as delivered
    from public.events where created_at > now() - interval '7 days'`,
  '연타·PERFECT 이상치(7일)': `with c as (
      select user_id, payload->>'judgment' as j, created_at,
        lag(created_at) over (partition by user_id order by id) as prev_at
      from public.events where type = 'catch' and created_at > now() - interval '7 days')
    select count(*) filter (where extract(epoch from created_at - prev_at) < 2)::int as fast_gaps,
      count(distinct user_id) filter (where extract(epoch from created_at - prev_at) < 2)::int as fast_users,
      round(100.0 * count(*) filter (where j = 'perfect') / greatest(count(*), 1), 1) as perfect_pct
    from c`,
};

/** 명성 게이트 정체 — 다음 배를 살 골드는 있으나 명성이 모자란 사용자 수 */
export const FAME_GATE_QUERY = `select boat, gold, fame from public.saves_current where not restricted`;

export function fameGateStuck(rows: { boat: number; gold: string | number; fame: string | number }[]) {
  const out = new Map<number, number>();
  for (const r of rows) {
    const next = BOATS.find(b => b.tier === r.boat + 1);
    if (next && Number(r.gold) >= next.price && Number(r.fame) < next.fameReq) out.set(next.tier, (out.get(next.tier) ?? 0) + 1);
  }
  return [...out].sort((a, b) => a[0] - b[0]).map(([tier, users]) => ({ next_boat: tier, users }));
}

export async function runLive(url: string, print: (title: string, rows: Record<string, unknown>[]) => void): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // 읽기 전용 트랜잭션 안에서만 조회한다 — 실수로 쓰는 문장이 섞여도 거부된다
    await client.query('begin read only');
    for (const [title, q] of Object.entries(LIVE_QUERIES)) print(title, (await client.query(q)).rows);
    print('명성 게이트 정체(다음 배)', fameGateStuck((await client.query(FAME_GATE_QUERY)).rows));
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end();
  }
}
