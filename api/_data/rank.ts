// 랭킹 읽기·주간 집계 — 공개해도 되는 값(닉네임·순위·값)만 돌려준다. uid와 이메일은 응답에 넣지 않는다.
// 같은 값은 같은 순위(rank)이고, 같은 순위 안에서는 그 값에 먼저 도달한 사람이 위다.
// 제재 계정과 게스트(익명 계정)는 모든 표에서 뺀다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { FISH } from '../../src/game/content/fish.js';
import { NAMED } from '../../src/game/content/named.js';
import {
  gameWeekStartDay,
  listGameWeekStartDays,
  nextGameWeekResetISO,
  weekStartDayToRangeISO,
} from '../../src/game/rules/time.js';
import { at, textArray } from './json.js';

const FISH_IDS = FISH.map(f => f.id);
const NAMED_IDS = NAMED.map(n => n.id);

export const RANK_TOP = 50;
/** 어종 순위는 도감 상세에 붙어 짧게 보여 준다 */
export const SPECIES_TOP = 10;

export type RankWindow = 'weekly' | 'all';
export interface RankRow { rank: number; nickname: string | null; value: number; me: boolean }
export interface RankBoard {
  top: RankRow[];
  me: { rank: number; value: number } | null;
  window: RankWindow;
  periodSupported: boolean;
  resetAt: string | null;
  weekStart: string | null;
  availableWeeks: string[];
}

interface BoardMeta {
  window: RankWindow;
  periodSupported: boolean;
  resetAt: string | null;
  weekStart: string | null;
  availableWeeks: string[];
}

const ALL_ONLY_META: BoardMeta = {
  window: 'all',
  periodSupported: false,
  resetAt: null,
  weekStart: null,
  availableWeeks: [],
};

function periodMeta(
  window: RankWindow,
  nowIso: string,
  resolvedWeek: string | null,
  availableWeeks: string[],
): BoardMeta {
  const currentWeek = gameWeekStartDay(nowIso);
  return {
    window,
    periodSupported: true,
    resetAt: window === 'weekly' && resolvedWeek === currentWeek ? nextGameWeekResetISO(nowIso) : null,
    weekStart: window === 'weekly' ? resolvedWeek : null,
    availableWeeks: window === 'weekly' ? availableWeeks : [],
  };
}

/** eligible(user_id, value, reached)에서 순위를 매겨 상위 목록과 내 순위를 만든다 */
async function rankBoard(
  db: Executor,
  eligible: SQL,
  uid: string | null,
  meta: BoardMeta,
  limit = RANK_TOP,
): Promise<RankBoard> {
  const me = sql`${uid}::uuid`;
  const { rows } = await db.execute<{ board: Pick<RankBoard, 'top' | 'me'> }>(sql`with eligible as (${eligible}),
    ranked as (
      select e.user_id, e.value, p.nickname,
        rank() over (order by e.value desc)::int as rank,
        row_number() over (order by e.value desc, e.reached asc nulls last, e.user_id) as ord
      from eligible e left join public.profiles p on p.user_id = e.user_id
    )
    select json_build_object(
      'top', (select coalesce(json_agg(json_build_object('rank', rank, 'nickname', nickname, 'value', value,
        'me', coalesce(user_id = ${me}, false)) order by ord), '[]') from ranked where ord <= ${limit}),
      'me', (select json_build_object('rank', rank, 'value', value) from ranked where user_id = ${me})
    ) as board`);
  return { ...rows[0].board, ...meta };
}

/** 명성 순위 — 주간(월요일 KST 04:00 시작) 또는 누적. 같은 명성이면 도달 시각이 이른 사람이 위 */
export async function fameBoard(
  db: Executor,
  uid: string | null,
  window: RankWindow = 'weekly',
  nowIso = new Date().toISOString(),
  weekStart?: string,
): Promise<RankBoard> {
  if (window === 'weekly') {
    const currentWeek = gameWeekStartDay(nowIso);
    const resolvedWeek = weekStart ?? currentWeek;
    const { rows } = await db.execute<{ earliest: string | null }>(
      sql`select min(week_start)::text as earliest from public.ranking_weekly_fame where fame_gained > 0`,
    );
    const earliest = rows[0]?.earliest;
    const earliestDay = earliest && earliest < currentWeek ? earliest : currentWeek;
    const availableWeeks = listGameWeekStartDays(earliestDay, currentWeek);
    const meta = periodMeta(window, nowIso, resolvedWeek, availableWeeks);
    return rankBoard(db, sql`select r.user_id, r.fame_gained::bigint as value, r.reached_at as reached
      from public.ranking_weekly_fame r
      join public.saves_current s on s.user_id = r.user_id and not s.restricted
      join auth.users u on u.id = r.user_id and not u.is_anonymous
      where r.week_start = ${resolvedWeek}::date and r.fame_gained > 0`, uid, meta);
  }
  return rankBoard(db, sql`select s.user_id, s.fame::bigint as value, s.updated_at as reached
    from public.saves_current s join auth.users u on u.id = s.user_id
    where not s.restricted and not u.is_anonymous and s.fame > 0`, uid, periodMeta(window, nowIso, null, []));
}

/** 판매골드 순위 — 주간(월요일 KST 04:00 시작) 또는 누적. 같은 금액이면 도달 시각이 이른 사람이 위 */
export async function sellGoldBoard(
  db: Executor,
  uid: string | null,
  window: RankWindow = 'weekly',
  nowIso = new Date().toISOString(),
  weekStart?: string,
): Promise<RankBoard> {
  if (window === 'weekly') {
    const currentWeek = gameWeekStartDay(nowIso);
    const resolvedWeek = weekStart ?? currentWeek;
    const { rows } = await db.execute<{ earliest: string | null }>(
      sql`select min(week_start)::text as earliest from public.ranking_weekly_sell_gold where gold_earned > 0`,
    );
    const earliest = rows[0]?.earliest;
    const earliestDay = earliest && earliest < currentWeek ? earliest : currentWeek;
    const availableWeeks = listGameWeekStartDays(earliestDay, currentWeek);
    const meta = periodMeta(window, nowIso, resolvedWeek, availableWeeks);
    return rankBoard(db, sql`select r.user_id, r.gold_earned::bigint as value, r.reached_at as reached
      from public.ranking_weekly_sell_gold r
      join public.saves_current s on s.user_id = r.user_id and not s.restricted
      join auth.users u on u.id = r.user_id and not u.is_anonymous
      where r.week_start = ${resolvedWeek}::date and r.gold_earned > 0`, uid, meta);
  }
  return rankBoard(db, sql`select c.user_id, c.value::bigint as value, c.updated_at as reached
    from public.achievement_counters c
    join public.saves_current s on s.user_id = c.user_id and not s.restricted
    join auth.users u on u.id = c.user_id and not u.is_anonymous
    where c.key = 'sell.gold' and c.value > 0`, uid, periodMeta(window, nowIso, null, []));
}

/** 도감 종목 수 순위 공통 — 지정 어종 목록·폼의 기록 수, 동순위 시 마지막 새 어종 도달 시각이 이른 사람이 위 */
function recordsCountBoard(
  db: Executor,
  uid: string | null,
  form: 'normal' | 'variant',
  ids: readonly string[],
): Promise<RankBoard> {
  return rankBoard(db, sql`select r.user_id, count(*)::int as value, max(coalesce(r.first_caught, r.updated_at)) as reached
    from public.records r join public.saves_current s on s.user_id = r.user_id and not s.restricted
    join auth.users u on u.id = r.user_id and not u.is_anonymous
    where r.form = ${form} and r.count > 0 and r.fish_id = any(${textArray(ids)})
    group by r.user_id`, uid, ALL_ONLY_META);
}

/** 일반 도감 완성도 순위 — 일반 어종의 일반 폼 발견 종 수(네임드 제외) */
export function dexBoard(db: Executor, uid: string | null): Promise<RankBoard> {
  return recordsCountBoard(db, uid, 'normal', FISH_IDS);
}

/** 돌연변이 도감 완성도 순위 — 일반 어종의 돌연변이 폼 발견 종 수 */
export function variantBoard(db: Executor, uid: string | null): Promise<RankBoard> {
  return recordsCountBoard(db, uid, 'variant', FISH_IDS);
}

/** 네임드 도감 순위 — 네임드 어종의 기록 종 수 */
export function namedBoard(db: Executor, uid: string | null): Promise<RankBoard> {
  return recordsCountBoard(db, uid, 'normal', NAMED_IDS);
}

/** 네임드 토벌 순위 — 주간(월요일 KST 04:00 시작) 또는 누적. 같은 수면 마지막 토벌 시각이 이른 사람이 위 */
export async function namedClearsBoard(
  db: Executor,
  uid: string | null,
  window: RankWindow = 'weekly',
  nowIso = new Date().toISOString(),
  weekStart?: string,
): Promise<RankBoard> {
  if (window === 'weekly') {
    const currentWeek = gameWeekStartDay(nowIso);
    const resolvedWeek = weekStart ?? currentWeek;
    const { rows } = await db.execute<{ earliest: Date | string | null }>(
      sql`select min(cleared_at) as earliest from public.bounty_clears where kind = 'named'`,
    );
    const rawEarliest = rows[0]?.earliest;
    const earliestIso = rawEarliest instanceof Date ? rawEarliest.toISOString() : rawEarliest;
    const earliestWeek = earliestIso ? gameWeekStartDay(earliestIso) : currentWeek;
    const earliestDay = earliestWeek < currentWeek ? earliestWeek : currentWeek;
    const availableWeeks = listGameWeekStartDays(earliestDay, currentWeek);
    const meta = periodMeta(window, nowIso, resolvedWeek, availableWeeks);
    const { startISO, nextStartISO } = weekStartDayToRangeISO(resolvedWeek);
    return rankBoard(db, sql`select bc.user_id, count(*)::bigint as value, max(bc.cleared_at) as reached
      from public.bounty_clears bc join public.saves_current s on s.user_id = bc.user_id and not s.restricted
      join auth.users u on u.id = bc.user_id and not u.is_anonymous
      where bc.kind = 'named' and bc.cleared_at >= ${at(startISO)} and bc.cleared_at < ${at(nextStartISO)}
      group by bc.user_id`, uid, meta);
  }
  return rankBoard(db, sql`select bc.user_id, count(*)::int as value, max(bc.cleared_at) as reached
    from public.bounty_clears bc join public.saves_current s on s.user_id = bc.user_id and not s.restricted
    join auth.users u on u.id = bc.user_id and not u.is_anonymous
    where bc.kind = 'named'
    group by bc.user_id`, uid, periodMeta(window, nowIso, null, []));
}

/** 어종 순위 — 그 어종을 사람별로 가장 크게 낚은 크기(폼 무관). 같은 크기면 기록을 먼저 남긴 사람이 위 */
export function speciesBoard(db: Executor, fishId: string, uid: string | null): Promise<RankBoard> {
  return rankBoard(db, sql`select r.user_id, max(r.max_size)::numeric as value, min(r.updated_at) as reached
    from public.records r join public.saves_current s on s.user_id = r.user_id and not s.restricted
    join auth.users u on u.id = r.user_id and not u.is_anonymous
    where r.fish_id = ${fishId} and r.max_size is not null
    group by r.user_id`, uid, ALL_ONLY_META, SPECIES_TOP);
}

/** 주간 명성 합산 조각 — 낙관 락(guard)이 통과했을 때만 해당 게임 주간의 획득 명성을 올린다 */
export function weeklyFameFragment(guard: SQL, uid: string, delta: number, nowIso: string): SQL | null {
  if (!Number.isFinite(delta) || delta <= 0) return null;
  const gained = Math.trunc(delta);
  if (gained <= 0) return null;
  const weekStart = gameWeekStartDay(nowIso);
  return sql`insert into public.ranking_weekly_fame (week_start, user_id, fame_gained, reached_at, updated_at)
    select ${weekStart}::date, ${uid}, ${gained}, ${at(nowIso)}, ${at(nowIso)}
    where ${guard}
    on conflict (week_start, user_id) do update
      set fame_gained = ranking_weekly_fame.fame_gained + excluded.fame_gained,
          reached_at = excluded.reached_at,
          updated_at = excluded.updated_at`;
}

/** 계정 정리에서 사용자의 주간 명성 집계 행을 모두 지운다 */
export async function deleteUserWeeklyFame(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.ranking_weekly_fame where user_id = ${uid}`);
}

/** 주간 판매골드 합산 조각 — 낙관 락(guard)이 통과했을 때만 해당 게임 주간의 판매골드를 올린다 */
export function weeklySellGoldFragment(guard: SQL, uid: string, delta: number, nowIso: string): SQL | null {
  if (!Number.isFinite(delta) || delta <= 0) return null;
  const earned = Math.trunc(delta);
  if (earned <= 0) return null;
  const weekStart = gameWeekStartDay(nowIso);
  return sql`insert into public.ranking_weekly_sell_gold (week_start, user_id, gold_earned, reached_at, updated_at)
    select ${weekStart}::date, ${uid}, ${earned}, ${at(nowIso)}, ${at(nowIso)}
    where ${guard}
    on conflict (week_start, user_id) do update
      set gold_earned = ranking_weekly_sell_gold.gold_earned + excluded.gold_earned,
          reached_at = excluded.reached_at,
          updated_at = excluded.updated_at`;
}

/** 계정 정리에서 사용자의 주간 판매골드 집계 행을 모두 지운다 */
export async function deleteUserWeeklySellGold(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.ranking_weekly_sell_gold where user_id = ${uid}`);
}
