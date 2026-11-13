// 쿠폰·지원 코드(coupons·reliefs) 쓰기 소유 모듈.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';

/** 사용 중인 동적 쿠폰 */
export async function findCoupon(db: Executor, code: string): Promise<{ gold: number; desc: string } | null> {
  const { rows } = await db.execute<{ gold: number; description: string }>(sql`select gold, description
    from public.coupons where code = ${code} and active`);
  return rows[0] ? { gold: rows[0].gold, desc: rows[0].description } : null;
}

export interface ReliefGrant { gold: number; fame: number; rod: number; boat: number; dex: unknown }

type ReliefRow = { gold: string | number; fame: string | number; rod: number; boat: number; dex: unknown };

const toGrant = (g: ReliefRow | undefined): ReliefGrant | null =>
  g ? { gold: Number(g.gold), fame: Number(g.fame), rod: Number(g.rod), boat: Number(g.boat), dex: g.dex } : null;

/** 아직 쓰지 않은 지원 코드의 지급분 — 읽기만 하고 코드를 소비하지 않는다 */
export async function findRelief(db: Executor, code: string): Promise<ReliefGrant | null> {
  const { rows } = await db.execute<ReliefRow>(sql`select gold, fame, rod, boat, dex from public.reliefs
    where code = ${code} and active`);
  return toGrant(rows[0]);
}

/** 지원 코드 소비 — 활성 코드를 조건부로 비활성화한 요청만 지급분을 받는다(코드당 1행이라 승자가 하나다).
 *  액션 확정과 같은 트랜잭션 안에서 부른다. 확정이 실패하면 함께 되돌려진다 */
export async function consumeRelief(db: Executor, code: string, uid: string): Promise<ReliefGrant | null> {
  const { rows } = await db.execute<ReliefRow>(
    sql`update public.reliefs set active = false, claimed_by = ${uid}
      where code = ${code} and active returning gold, fame, rod, boat, dex`);
  return toGrant(rows[0]);
}
