// 프로필(profiles) 쓰기 소유 모듈 — 첫 액션의 게스트명 보장과 닉네임 변경.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { at } from './json.js';

/**
 * 게스트명 보장 — 후보 이름을 차례로 넣어 본다. 이름이 겹치거나 행이 이미 있으면 다음 후보로 넘어간다.
 * 후보는 호출자가 attempt 번호로 만든다(난수 소비 순서를 호출자가 정한다). 끝내 못 넣으면 false.
 */
export async function ensureProfile(db: Executor, uid: string, candidate: (attempt: number) => string,
  attempts = 20): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const { rows } = await db.execute(sql`insert into public.profiles (user_id, nickname)
      values (${uid}, ${candidate(i)}) on conflict do nothing returning user_id`);
    if (rows.length > 0) return true;
  }
  return false;
}

export async function profileExists(db: Executor, uid: string): Promise<boolean> {
  const { rows } = await db.execute(sql`select 1 from public.profiles where user_id = ${uid}`);
  return rows.length > 0;
}

/** 다른 사용자가 같은 이름(대소문자 무시)을 쓰는가 */
export async function nicknameTaken(db: Executor, uid: string, nickname: string): Promise<boolean> {
  const { rows } = await db.execute<{ taken: boolean }>(sql`select exists (select 1 from public.profiles
    where user_id <> ${uid} and lower(nickname) = lower(${nickname})) as taken`);
  return rows[0].taken;
}

export async function setNickname(db: Executor, uid: string, nickname: string, nowISO: string): Promise<void> {
  await db.execute(sql`insert into public.profiles (user_id, nickname, updated_at)
    values (${uid}, ${nickname}, ${at(nowISO)})
    on conflict (user_id) do update set nickname = excluded.nickname, updated_at = excluded.updated_at`);
}

/** 계정 정리에서 사용자의 프로필 행을 지운다 */
export async function deleteUserProfile(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.profiles where user_id = ${uid}`);
}
