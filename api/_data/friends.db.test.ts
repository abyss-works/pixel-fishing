// 친구 모듈 — 실제 Postgres에서 요청·수락·삭제·목록과 닉네임 검색을 검사한다.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import {
  acceptFriend, accountByNickname, deleteUserFriends, isAccount, listFriends, removeFriend, requestFriend,
} from './friends.js';

let testDb: TestDatabase;
let client: Client;
let database: Database;

beforeAll(async () => {
  testDb = await createTestDatabase();
  client = new Client({ connectionString: testDb.url });
  await client.connect();
  database = createDatabase({ connectionString: testDb.url, max: 2 });
});
afterAll(async () => {
  await database?.pool.end();
  await client?.end();
  await testDb?.drop();
});

const NOW = '2026-11-05T03:00:00.000Z';

async function user(nickname: string | null, anonymous = false): Promise<string> {
  const uid = randomUUID();
  await client.query('insert into auth.users (id, email, is_anonymous) values ($1, $2, $3)',
    [uid, anonymous ? `${uid}@anonymous.invalid` : `${uid}@test.dev`, anonymous]);
  if (nickname) await client.query('insert into public.profiles (user_id, nickname) values ($1, $2)', [uid, nickname]);
  return uid;
}

describe('friends', () => {
  it('닉네임으로 계정만 찾는다(대소문자 무시, 게스트 제외)', async () => {
    const a = await user('Sunfish');
    await user('guestfish', true);
    expect(await accountByNickname(database.db, 'sunFISH')).toBe(a);
    expect(await accountByNickname(database.db, 'guestfish')).toBeNull();
    expect(await isAccount(database.db, a)).toBe(true);
  });

  it('요청하면 받은 쪽에 incoming이 되고, 수락하면 양쪽 friend가 되며 마지막 행동 시각이 붙는다', async () => {
    const a = await user('가람');
    const b = await user('나루');
    await client.query(`insert into public.saves_current (user_id, data, updated_at) values ($1, '{}', $2)`, [b, NOW]);
    expect(await requestFriend(database.db, a, b, NOW)).toBe('requested');
    expect(await requestFriend(database.db, a, b, NOW)).toBe('already');
    expect(await listFriends(database.db, a)).toEqual([{ uid: b, nick: '나루', state: 'outgoing', lastActiveAt: NOW }]);
    expect(await listFriends(database.db, b)).toEqual([{ uid: a, nick: '가람', state: 'incoming', lastActiveAt: null }]);
    expect(await acceptFriend(database.db, a, b, NOW)).toBe(false);
    expect(await acceptFriend(database.db, b, a, NOW)).toBe(true);
    expect((await listFriends(database.db, a))[0].state).toBe('friend');
    expect((await listFriends(database.db, b))[0].state).toBe('friend');
    expect(await requestFriend(database.db, b, a, NOW)).toBe('already');
  });

  it('상대가 먼저 요청했으면 내 요청이 바로 수락이 되고, 삭제는 방향과 무관하다', async () => {
    const a = await user('다온');
    const b = await user('라온');
    await requestFriend(database.db, a, b, NOW);
    expect(await requestFriend(database.db, b, a, NOW)).toBe('accepted');
    expect((await listFriends(database.db, a))[0].state).toBe('friend');
    await removeFriend(database.db, b, a);
    expect(await listFriends(database.db, a)).toEqual([]);
  });

  it('계정 정리는 그 사용자의 관계를 모두 지운다', async () => {
    const [a, b, c] = [await user('마루'), await user('바다'), await user('사랑')];
    await requestFriend(database.db, a, b, NOW);
    await requestFriend(database.db, c, a, NOW);
    await deleteUserFriends(database.db, a);
    expect(await listFriends(database.db, b)).toEqual([]);
    expect(await listFriends(database.db, c)).toEqual([]);
  });
});
