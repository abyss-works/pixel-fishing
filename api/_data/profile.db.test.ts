// 프로필 모듈 — 실제 Postgres에서 실시간 채널 표시 이름과 배 읽기를 검사한다.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import { liveIdentity, publicProfile } from './profile.js';

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

async function user(account = false): Promise<string> {
  const uid = randomUUID();
  await client.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, $3)`,
    [uid, account ? `${uid}@example.com` : `${uid}@anonymous.invalid`, !account]);
  return uid;
}

describe('liveIdentity', () => {
  it('프로필 이름과 저장 상태의 배를 읽는다', async () => {
    const uid = await user();
    await client.query(`insert into public.profiles (user_id, nickname) values ($1, '갈매기')`, [uid]);
    await client.query(`insert into public.saves_current (user_id, data, boat) values ($1, '{}', 3)`, [uid]);
    expect(await liveIdentity(database.db, uid)).toEqual({ nick: '갈매기', boat: 3 });
  });

  it('프로필과 저장 상태가 없으면 이름은 null, 배는 0이다', async () => {
    expect(await liveIdentity(database.db, await user())).toEqual({ nick: null, boat: 0 });
  });
});

describe('publicProfile', () => {
  it('닉네임·배·낚싯대·명성, 일반 폼으로 낚은 어종, 가진 유물을 읽는다', async () => {
    const uid = await user(true);
    await client.query(`insert into public.profiles (user_id, nickname) values ($1, '고등어왕')`, [uid]);
    await client.query(`insert into public.saves_current (user_id, data, boat, fame) values ($1, '{}', 2, 12345)`, [uid]);
    await client.query(`update public.saves_current set rod = 9, data = '{"artifacts":["wreck-compass","abyss-angler"]}' where user_id = $1`, [uid]);
    await client.query(`insert into public.records (user_id, fish_id, form, count) values
      ($1, 'crucian', 'normal', 3), ($1, 'crucian', 'variant', 1), ($1, 'carp', 'variant', 2),
      ($1, 'eel', 'normal', 1), ($1, 'perch', 'normal', 0)`, [uid]);
    expect(await publicProfile(database.db, uid)).toEqual({
      nickname: '고등어왕', boat: 2, rod: 9, fame: 12345, dexFish: ['crucian', 'eel'],
      artifacts: ['wreck-compass', 'abyss-angler'], account: true,
    });
  });

  it('프로필과 저장 상태가 없는 게스트는 기본값으로 읽는다', async () => {
    expect(await publicProfile(database.db, await user())).toEqual({
      nickname: null, boat: 0, rod: 1, fame: 0, dexFish: [], artifacts: [], account: false,
    });
  });

  it('없는 사용자는 null이다', async () => {
    expect(await publicProfile(database.db, randomUUID())).toBeNull();
  });
});
