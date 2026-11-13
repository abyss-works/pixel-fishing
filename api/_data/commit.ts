// 액션 확정 — 표의 소유 모듈이 만든 쓰기 조각을 한 문장으로 묶어 한 번에 실행한다.
// 첫 조각은 낙관 락 갱신(upd)이고, 나머지 조각은 upd가 행을 바꿨을 때만 쓴다(guard).
// 한 문장이라 전부 쓰이거나 전부 쓰이지 않는다. 이 모듈은 표를 직접 쓰지 않는다.
// 같은 계정의 요청끼리만 다투는 한 번만 쓰는 행의 소비는 commitGated가 확정 문장 안에서 처리한다.
// 다른 계정과 행을 두고 다투는 소비는 문장 안에서 줄 세울 수 없어 commitConsumingCode가 같은 트랜잭션으로 묶는다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database, Executor } from '../_db/client.js';

/** upd가 행을 바꿨는가 — 조각의 쓰기 조건 */
export const COMMIT_GUARD: SQL = sql`exists (select 1 from upd)`;

function commitStatement(versionUpdate: SQL, fragments: readonly (SQL | null)[]): SQL {
  const parts = fragments.filter((f): f is SQL => f !== null)
    .map((f, i) => sql`${sql.raw(`w${i}`)} as (${f})`);
  return sql`with upd as (${versionUpdate})${parts.length > 0 ? sql`, ${sql.join(parts, sql`, `)}` : sql``}
    select count(*)::int as n from upd`;
}

/** 확정 문장을 실행하고 낙관 락을 얻었는가(경합이면 false)를 돌려준다 */
export async function commitAction(db: Executor, versionUpdate: SQL, fragments: readonly (SQL | null)[]): Promise<boolean> {
  const { rows } = await db.execute<{ n: number }>(commitStatement(versionUpdate, fragments));
  return rows[0].n > 0;
}

export type CommitOutcome = 'committed' | 'conflict' | 'unavailable';

/**
 * 선행 행(gate)이 있을 때만 확정하는 문장을 실행한다. versionUpdate의 조건에 gate가 들어 있어야 하고,
 * 소비하는 조각은 COMMIT_GUARD로 같은 문장에서 선행 행을 지운다. 확정되면 'committed'다.
 * 아무것도 쓰이지 않았으면 선행 행을 문장 밖에서 다시 읽어 가른다. 행이 없으면 'unavailable', 있으면 낙관 락이
 * 어긋난 'conflict'다. 문장은 잠금을 기다리는 동안 다른 요청이 지운 행을 자기 시작 시점의 스냅샷으로 계속 보므로,
 * 문장 안의 판정이 아니라 이 다시 읽기의 결과를 쓴다. 다시 읽은 직후 행이 사라져도 'conflict'로 답하고,
 * 클라이언트의 재시도가 'unavailable'을 받는다.
 */
export async function commitGated(db: Executor, versionUpdate: SQL, fragments: readonly (SQL | null)[], gate: SQL): Promise<CommitOutcome> {
  if (await commitAction(db, versionUpdate, fragments)) return 'committed';
  const { rows } = await db.execute<{ present: boolean }>(sql`select exists (${gate}) as present`);
  return rows[0].present ? 'conflict' : 'unavailable';
}

/** 확정 실패 때 소비를 함께 되돌리려고 트랜잭션을 중단시키는 표지 */
class ConflictRollback extends Error {}

/**
 * 다른 계정과 다투는 한 번만 쓸 수 있는 지원 코드의 소비와 액션 확정을 한 트랜잭션에 묶는다.
 * 소비를 먼저 실행해 행 잠금으로 경합 요청을 줄 세우고, 확정이 경합(낙관 락 실패)이면 소비까지 되돌린다.
 * consume이 false이면 이미 다른 요청이 소비한 것이라 아무것도 쓰지 않고 'unavailable'을 돌려준다.
 */
export async function commitConsumingCode(
  withTransaction: Database['withTransaction'],
  consume: (tx: Executor) => Promise<boolean>,
  versionUpdate: SQL,
  fragments: readonly (SQL | null)[],
): Promise<CommitOutcome> {
  try {
    return await withTransaction(async tx => {
      if (!await consume(tx)) return 'unavailable';
      if (!await commitAction(tx, versionUpdate, fragments)) throw new ConflictRollback();
      return 'committed';
    });
  } catch (error) {
    if (error instanceof ConflictRollback) return 'conflict';
    throw error;
  }
}

/** 서로 독립인 후속 쓰기를 한 문장으로 실행한다 */
export async function runFollowUps(db: Executor, statements: readonly (SQL | null)[]): Promise<void> {
  const parts = statements.filter((s): s is SQL => s !== null);
  if (parts.length === 0) return;
  if (parts.length === 1) { await db.execute(parts[0]); return; }
  const ctes = parts.map((s, i) => sql`${sql.raw(`f${i}`)} as (${s})`);
  await db.execute(sql`with ${sql.join(ctes, sql`, `)} select 1`);
}
