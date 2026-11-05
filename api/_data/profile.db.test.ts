// 프로필 모듈 — 실제 Postgres에서 실시간 채널 표시 이름과 배 읽기를 검사한다.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import { liveIdentity } from './profile.js';

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

async function user(): Promise<string> {
  const uid = randomUUID();
  await client.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, true)`, [uid, `${uid}@anonymous.invalid`]);
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
