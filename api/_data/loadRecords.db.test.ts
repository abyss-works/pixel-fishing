// 도감 기록 읽기 — 사용자의 기록 행을 표 열 이름 그대로 돌려주는지 실제 Postgres로 검사한다.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import { loadRecords } from './load.js';

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
  await client.query('insert into auth.users (id, email, is_anonymous) values ($1, $2, false)', [uid, `${uid}@test.dev`]);
  await client.query('insert into public.profiles (user_id, nickname) values ($1, $2)', [uid, `r${uid.slice(0, 8)}`]);
  return uid;
}

describe('loadRecords', () => {
  it('사용자의 도감 행을 폼마다 돌려준다', async () => {
    const uid = await user();
    await client.query(`insert into public.records (user_id, fish_id, form, count, max_size, first_caught)
      values ($1, 'test-fish', 'normal', 3, 12.5, '2030-01-01T00:00:00Z'),
             ($1, 'test-fish', 'variant', 1, null, null)`, [uid]);

    const rows = await loadRecords(database.db, uid);

    expect(rows).toHaveLength(2);
    const normal = rows.find(r => r.form === 'normal')!;
    expect(normal.fish_id).toBe('test-fish');
    expect(Number(normal.count)).toBe(3);
    expect(normal.max_size).toBe(12.5);
    const variant = rows.find(r => r.form === 'variant')!;
    expect(Number(variant.count)).toBe(1);
    expect(variant.max_size).toBeNull();
    expect(variant.first_caught).toBeNull();
  });

  it('기록이 없는 사용자는 빈 배열을 받는다', async () => {
    const uid = await user();
    expect(await loadRecords(database.db, uid)).toEqual([]);
  });

  it('다른 사용자의 기록은 섞이지 않는다', async () => {
    const mine = await user();
    const other = await user();
    await client.query(
      `insert into public.records (user_id, fish_id, form, count, max_size) values ($1, 'test-fish', 'normal', 1, 1)`,
      [other]);
    expect(await loadRecords(database.db, mine)).toEqual([]);
  });
});
