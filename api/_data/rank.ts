// 랭킹 읽기 — 공개해도 되는 값(닉네임·순위·값)만 돌려준다. uid와 이메일은 응답에 넣지 않는다.
// 같은 값은 같은 순위(rank)이고, 같은 순위 안에서는 그 값에 먼저 도달한 사람이 위다.
// 제재 계정은 모든 표에서 뺀다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';

export const RANK_TOP = 50;

export interface RankRow { rank: number; nickname: string | null; value: number; me: boolean }
export interface RankBoard { top: RankRow[]; me: { rank: number; value: number } | null }
export interface BiggestRow { fishId: string; size: number; nickname: string | null; me: boolean }

/** eligible(user_id, value, reached)에서 순위를 매겨 상위 목록과 내 순위를 만든다 */
async function rankBoard(db: Executor, eligible: SQL, uid: string | null): Promise<RankBoard> {
  const me = sql`${uid}::uuid`;
  const { rows } = await db.execute<{ board: RankBoard }>(sql`with eligible as (${eligible}),
    ranked as (
      select e.user_id, e.value, p.nickname,
        rank() over (order by e.value desc)::int as rank,
        row_number() over (order by e.value desc, e.reached asc nulls last, e.user_id) as ord
      from eligible e left join public.profiles p on p.user_id = e.user_id
    )
    select json_build_object(
      'top', (select coalesce(json_agg(json_build_object('rank', rank, 'nickname', nickname, 'value', value,
        'me', coalesce(user_id = ${me}, false)) order by ord), '[]') from ranked where ord <= ${RANK_TOP}),
      'me', (select json_build_object('rank', rank, 'value', value) from ranked where user_id = ${me})
    ) as board`);
  return rows[0].board;
}

/** 명성 순위 — 같은 명성이면 마지막 저장 시각이 이른 사람이 위 */
export function fameBoard(db: Executor, uid: string | null): Promise<RankBoard> {
  return rankBoard(db, sql`select user_id, fame::bigint as value, updated_at as reached
    from public.saves_current where not restricted and fame > 0`, uid);
}

/** 도감 완성도 순위 — 일반 폼으로 낚은 어종 수. 같은 수면 마지막 새 어종을 먼저 낚은 사람이 위 */
export function dexBoard(db: Executor, uid: string | null): Promise<RankBoard> {
  return rankBoard(db, sql`select r.user_id, count(*)::int as value, max(coalesce(r.first_caught, r.updated_at)) as reached
    from public.records r join public.saves_current s on s.user_id = r.user_id and not s.restricted
    where r.form = 'normal' and r.count > 0
    group by r.user_id`, uid);
}

/** 어종별 월척 — 어종마다 가장 큰 크기(폼 무관)와 주인. 같은 크기면 기록을 먼저 남긴 사람 */
export async function biggestBoard(db: Executor, uid: string | null): Promise<BiggestRow[]> {
  const { rows } = await db.execute<{ fish_id: string; size: number; nickname: string | null; me: boolean }>(sql`
    select distinct on (r.fish_id) r.fish_id, r.max_size as size, p.nickname, coalesce(r.user_id = ${uid}::uuid, false) as me
    from public.records r
    join public.saves_current s on s.user_id = r.user_id and not s.restricted
    left join public.profiles p on p.user_id = r.user_id
    where r.max_size is not null
    order by r.fish_id, r.max_size desc, r.updated_at asc, r.user_id`);
  return rows.map(r => ({ fishId: r.fish_id, size: Number(r.size), nickname: r.nickname, me: r.me }));
}
