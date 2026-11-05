// 개인 차단(blocks) 소유 모듈 — 차단·해제와 목록 조회. 차단 목록은 계정마다 하나다.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';

/** 차단한다. 이미 차단했으면 그대로 둔다. 자기 자신은 차단할 수 없다(호출자가 거른다) */
export async function block(db: Executor, uid: string, target: string): Promise<void> {
  await db.execute(sql`insert into public.blocks (user_id, blocked_id) values (${uid}, ${target}) on conflict do nothing`);
}

export async function unblock(db: Executor, uid: string, target: string): Promise<void> {
  await db.execute(sql`delete from public.blocks where user_id = ${uid} and blocked_id = ${target}`);
}

/** 내가 차단한 사람의 id */
export async function blockedIds(db: Executor, uid: string): Promise<string[]> {
  const { rows } = await db.execute<{ id: string }>(sql`select blocked_id::text as id from public.blocks
    where user_id = ${uid} order by created_at`);
  return rows.map(r => r.id);
}

/** 내가 차단한 사람과 표시 이름(차단 목록 화면용). 프로필이 없으면 이름은 null이다 */
export async function blockedUsers(db: Executor, uid: string): Promise<{ uid: string; nick: string | null }[]> {
  const { rows } = await db.execute<{ uid: string; nick: string | null }>(sql`select b.blocked_id::text as uid, p.nickname as nick
    from public.blocks b left join public.profiles p on p.user_id = b.blocked_id
    where b.user_id = ${uid} order by b.created_at, b.blocked_id`);
  return rows;
}

/** 계정 정리에서 그 사용자가 차단한 행과 그 사용자를 차단한 행을 지운다 */
export async function deleteUserBlocks(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.blocks where user_id = ${uid} or blocked_id = ${uid}`);
}

/** 둘 중 한쪽이라도 다른 쪽을 차단했는가 */
export async function blockedEitherWay(db: Executor, a: string, b: string): Promise<boolean> {
  const { rows } = await db.execute<{ blocked: boolean }>(sql`select exists (select 1 from public.blocks
    where (user_id = ${a} and blocked_id = ${b}) or (user_id = ${b} and blocked_id = ${a})) as blocked`);
  return rows[0].blocked;
}
