// 현상금 표(bounty_accepts·bounty_clears·bounty_progress·bounty_tickets) 쓰기 소유 모듈.
// 액션 확정과 함께 쓰는 행은 핵심 쓰기에 들어가는 조각으로 만든다. 조각은 guard가 참일 때만 쓴다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import type { DebugTablePlan } from '../action.js';
import type { BountyQuest } from '../../src/game/content/bounties.js';
import { bountyKindOf } from '../../src/game/content/bounties.js';
import { at, jsonParam, textArray } from './json.js';

/** 납품 선소비 — 진행 행을 먼저 지운다. 지운 요청만 납품에 성공한다. 지운 행이 있었는가를 돌려준다 */
export async function consumeDelivery(db: Executor, uid: string, questId: string): Promise<boolean> {
  const { rows } = await db.execute(sql`delete from public.bounty_progress
    where user_id = ${uid} and quest_id = ${questId} returning quest_id`);
  return rows.length > 0;
}

/** 수주 — 수주 기록 행, 진행 행, 같은 의뢰의 묵은 도전권 삭제. 모두 서버 시각으로 쓴다.
 *  수주 기록은 이력일 뿐 하루 한도는 클리어 기록이 센다. 진행 행의 시작 시각이 만료의 기준이다.
 *  같은 의뢰의 행이 이미 남아 있으면 그것은 만료된 이전 수주의 잔재다(살아 있는 같은 갈래의 수주가 있으면
 *  리듀서가 거부한다). 진행도 0, 새 시작 시각으로 되돌리되 하루의 시작 이후에 수주해 살아 있는 행은 건드리지 않는다.
 *  묵은 도전권은 새 수주의 도전권이 아니므로 함께 지운다. */
export function acceptFragments(guard: SQL, uid: string, quest: BountyQuest, port: string, nowISO: string, dayStartISO: string): SQL[] {
  return [
    sql`insert into public.bounty_accepts (user_id, zone, port, quest_id, accepted_at)
      select ${uid}, ${quest.zone}, ${port}, ${quest.id}, ${at(nowISO)} where ${guard}`,
    sql`insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at, updated_at)
      select ${uid}, ${quest.zone}, ${quest.id}, 0, ${at(nowISO)}, ${at(nowISO)} where ${guard}
      on conflict (user_id, quest_id) do update
        set progress = 0, started_at = excluded.started_at, updated_at = excluded.updated_at
        where bounty_progress.started_at < ${at(dayStartISO)} and bounty_progress.progress < ${quest.count}`,
    sql`delete from public.bounty_tickets where user_id = ${uid} and quest_id = ${quest.id} and ${guard}`,
  ];
}

/** 클리어 기록 — 보상을 받는 납품·토벌과 같은 확정 문장에서 쓴다. 하루 한도가 이 행의 수로 정해진다 */
export function clearFragment(guard: SQL, uid: string, quest: BountyQuest, nowISO: string): SQL {
  return sql`insert into public.bounty_clears (user_id, kind, quest_id, cleared_at)
    select ${uid}, ${bountyKindOf(quest)}, ${quest.id}, ${at(nowISO)} where ${guard}`;
}

/** 만료된 의뢰의 정리 — 진행 행과 도전권. 응답 뒤 후속 쓰기다(만료 판정은 읽을 때 끝나 있어 정리가 늦어도 판정은 같다).
 *  만료 조건을 SQL에도 그대로 걸어, 그 사이 새로 수주해 살아난 행은 지우지 않는다. */
export function expiredCleanup(uid: string, quests: readonly { id: string; count: number }[], dayStartISO: string): SQL[] {
  if (quests.length === 0) return [];
  const counts = jsonParam(quests.map(q => ({ quest_id: q.id, count: q.count })));
  const expired = sql`p.user_id = ${uid} and p.quest_id = q.quest_id
    and p.started_at < ${at(dayStartISO)} and p.progress < q.count`;
  return [
    sql`delete from public.bounty_tickets t
      using public.bounty_progress p, json_to_recordset(${counts}) as q(quest_id text, count int)
      where t.user_id = ${uid} and t.quest_id = p.quest_id and ${expired}`,
    sql`delete from public.bounty_progress p
      using json_to_recordset(${counts}) as q(quest_id text, count int)
      where ${expired}`,
  ];
}

/** 도전권 발급 — 의뢰당 1행이라 재조우면 발급 시각만 갱신된다 */
export function ticketFragment(guard: SQL, uid: string, questIds: readonly string[], nowISO: string): SQL | null {
  if (questIds.length === 0) return null;
  return sql`insert into public.bounty_tickets (user_id, quest_id, issued_at)
    select ${uid}, q, ${at(nowISO)} from unnest(${textArray(questIds)}) as q where ${guard}
    on conflict (user_id, quest_id) do update set issued_at = excluded.issued_at`;
}

/** 결투 결과 확정 — 성공·실패 모두 도전권 행을 지우고, 성공만 진행도를 1 올린다 */
export function challengeFragments(guard: SQL, uid: string, questId: string, success: boolean, nowISO: string): SQL[] {
  const out = [sql`delete from public.bounty_tickets where user_id = ${uid} and quest_id = ${questId} and ${guard}`];
  if (success) {
    out.push(sql`update public.bounty_progress set progress = progress + 1, updated_at = ${at(nowISO)}
      where user_id = ${uid} and quest_id = ${questId} and ${guard}`);
  }
  return out;
}

const DEBUG_TABLES = new Set(['bounty_tickets', 'bounty_clears', 'bounty_progress']);
const DEBUG_COLUMNS = new Set(['issued_at', 'cleared_at']);

/** 개발 도구 표 명령 — 본인 행에 대한 쓰기 계획을 조각으로 만든다 */
export function debugFragment(guard: SQL, uid: string, plan: DebugTablePlan): SQL {
  if (!DEBUG_TABLES.has(plan.table)) throw new Error(`debug table not allowed: ${plan.table}`);
  const table = sql.raw(`public.${plan.table}`);
  if (plan.op === 'update') {
    const sets = Object.entries(plan.values).map(([col, value]) => {
      if (!DEBUG_COLUMNS.has(col)) throw new Error(`debug column not allowed: ${col}`);
      return sql`${sql.raw(col)} = ${at(String(value))}`;
    });
    return sql`update ${table} set ${sql.join(sets, sql`, `)} where user_id = ${uid} and ${guard}`;
  }
  if (plan.since && !DEBUG_COLUMNS.has(plan.since.column)) throw new Error(`debug column not allowed: ${plan.since.column}`);
  const since = plan.since ? sql` and ${sql.raw(plan.since.column)} >= ${at(plan.since.iso)}` : sql``;
  return sql`delete from ${table} where user_id = ${uid}${since} and ${guard}`;
}

/** 캐치가 진전시킨 일반 의뢰의 진행도 +1 — 응답 뒤 후속 쓰기다 */
export function advanceProgress(uid: string, questIds: readonly string[], nowISO: string): SQL | null {
  if (questIds.length === 0) return null;
  return sql`update public.bounty_progress set progress = progress + 1, updated_at = ${at(nowISO)}
    where user_id = ${uid} and quest_id = any(${textArray(questIds)})`;
}
