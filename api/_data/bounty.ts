// 현상금 표(bounty_accepts·bounty_progress·bounty_tickets) 쓰기 소유 모듈.
// 액션 확정과 함께 쓰는 행은 핵심 쓰기에 들어가는 조각으로 만든다. 조각은 guard가 참일 때만 쓴다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import type { DebugTablePlan } from '../action.js';
import { at, textArray } from './json.js';

/** 납품 선소비 — 진행 행을 먼저 지운다. 지운 요청만 납품에 성공한다. 지운 행이 있었는가를 돌려준다 */
export async function consumeDelivery(db: Executor, uid: string, questId: string): Promise<boolean> {
  const { rows } = await db.execute(sql`delete from public.bounty_progress
    where user_id = ${uid} and quest_id = ${questId} returning quest_id`);
  return rows.length > 0;
}

/** 수주 — 수주 행과 진행 행. 진행 행은 이미 있으면 그대로 둔다(경합 창에서 진행도를 0으로 되돌리지 않는다) */
export function acceptFragments(guard: SQL, uid: string, quest: { id: string; zone: string }, port: string, nowISO: string): SQL[] {
  return [
    sql`insert into public.bounty_accepts (user_id, zone, port, quest_id)
      select ${uid}, ${quest.zone}, ${port}, ${quest.id} where ${guard}`,
    sql`insert into public.bounty_progress (user_id, zone, quest_id, progress, updated_at)
      select ${uid}, ${quest.zone}, ${quest.id}, 0, ${at(nowISO)} where ${guard}
      on conflict (user_id, quest_id) do nothing`,
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

const DEBUG_TABLES = new Set(['bounty_tickets', 'bounty_accepts', 'bounty_progress']);
const DEBUG_COLUMNS = new Set(['issued_at', 'accepted_at']);

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
