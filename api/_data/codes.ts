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

/** 지원 코드 선소비 — 활성 코드를 조건부로 비활성화한 요청만 지급분을 받는다(코드당 1행이라 승자가 하나다) */
export async function consumeRelief(db: Executor, code: string, uid: string): Promise<ReliefGrant | null> {
  const { rows } = await db.execute<{ gold: string | number; fame: string | number; rod: number; boat: number; dex: unknown }>(
    sql`update public.reliefs set active = false, claimed_by = ${uid}
      where code = ${code} and active returning gold, fame, rod, boat, dex`);
  const g = rows[0];
  return g ? { gold: Number(g.gold), fame: Number(g.fame), rod: Number(g.rod), boat: Number(g.boat), dex: g.dex } : null;
}
