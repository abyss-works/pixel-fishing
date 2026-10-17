// 액션 확정 — 표의 소유 모듈이 만든 쓰기 조각을 한 문장으로 묶어 한 번에 실행한다.
// 첫 조각은 낙관 락 갱신(upd)이고, 나머지 조각은 upd가 행을 바꿨을 때만 쓴다(guard).
// 한 문장이라 전부 쓰이거나 전부 쓰이지 않는다. 이 모듈은 표를 직접 쓰지 않는다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';

/** upd가 행을 바꿨는가 — 조각의 쓰기 조건 */
export const COMMIT_GUARD: SQL = sql`exists (select 1 from upd)`;

/** 확정 문장을 실행하고 낙관 락을 얻었는가(경합이면 false)를 돌려준다 */
export async function commitAction(db: Executor, versionUpdate: SQL, fragments: readonly (SQL | null)[]): Promise<boolean> {
  const parts = fragments.filter((f): f is SQL => f !== null)
    .map((f, i) => sql`${sql.raw(`w${i}`)} as (${f})`);
  const { rows } = await db.execute<{ n: number }>(sql`with upd as (${versionUpdate})${parts.length > 0 ? sql`, ${sql.join(parts, sql`, `)}` : sql``}
    select count(*)::int as n from upd`);
  return rows[0].n > 0;
}

/** 서로 독립인 후속 쓰기를 한 문장으로 실행한다 */
export async function runFollowUps(db: Executor, statements: readonly (SQL | null)[]): Promise<void> {
  const parts = statements.filter((s): s is SQL => s !== null);
  if (parts.length === 0) return;
  if (parts.length === 1) { await db.execute(parts[0]); return; }
  const ctes = parts.map((s, i) => sql`${sql.raw(`f${i}`)} as (${s})`);
  await db.execute(sql`with ${sql.join(ctes, sql`, `)} select 1`);
}
