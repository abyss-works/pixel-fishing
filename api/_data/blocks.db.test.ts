// 개인 차단 모듈 — 실제 Postgres에서 차단·해제·목록·양방향 판정을 검사한다.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import { block, blockedEitherWay, blockedIds, unblock } from './blocks.js';

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

describe('blocks', () => {
  it('차단은 한 번만 남고, 목록과 양방향 판정에 보이며, 해제하면 사라진다', async () => {
    const [a, b, c] = [await user(), await user(), await user()];
    await block(database.db, a, b);
    await block(database.db, a, b);
    await block(database.db, a, c);
    expect(await blockedIds(database.db, a)).toEqual([b, c]);
    expect(await blockedEitherWay(database.db, b, a)).toBe(true);
    expect(await blockedEitherWay(database.db, b, c)).toBe(false);
    await unblock(database.db, a, b);
    expect(await blockedIds(database.db, a)).toEqual([c]);
    expect(await blockedEitherWay(database.db, a, b)).toBe(false);
  });

  it('자기 자신 차단은 DB가 거부한다', async () => {
    const a = await user();
    await expect(block(database.db, a, a)).rejects.toThrow();
  });
});
