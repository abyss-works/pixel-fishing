// 마지막 위치 저장 모듈 — 계정마다 바다 지역 안에서 마지막으로 있던 좌표 한 행(last_positions)을 쓰고 읽는다.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';

export interface LastPosition {
  region: string;
  x: number;
  y: number;
}

/** 그 계정의 마지막 위치를 덮어쓴다 */
export async function saveLastPosition(db: Executor, uid: string, pos: LastPosition): Promise<void> {
  await db.execute(sql`insert into public.last_positions (user_id, region, x, y, updated_at)
    values (${uid}, ${pos.region}, ${pos.x}, ${pos.y}, now())
    on conflict (user_id) do update set region = excluded.region, x = excluded.x, y = excluded.y, updated_at = excluded.updated_at`);
}

/** 그 계정의 마지막 위치. 기록이 없으면 null이다 */
export async function readLastPosition(db: Executor, uid: string): Promise<LastPosition | null> {
  const { rows } = await db.execute<{ region: string; x: number; y: number }>(sql`select region, x, y
    from public.last_positions where user_id = ${uid}`);
  const r = rows[0];
  return r ? { region: r.region, x: Number(r.x), y: Number(r.y) } : null;
}

/** 계정 정리에서 사용자의 마지막 위치를 지운다 */
export async function deleteUserPosition(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.last_positions where user_id = ${uid}`);
}
