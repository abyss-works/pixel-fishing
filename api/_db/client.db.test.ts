import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import { createDatabase } from './client.js';
import type { Database } from './client.js';
import { describeDbError, isUniqueViolation } from './errors.js';

let testDb: TestDatabase;
let database: Database;

beforeAll(async () => {
  testDb = await createTestDatabase();
  // 연결 하나로 제한해 연결 반환 누락이 다음 호출의 대기로 드러나게 한다.
  database = createDatabase({ connectionString: testDb.url, max: 1, connectionTimeoutMillis: 2000 });
  await database.db.execute(sql`create table probe (id text primary key, email text)`);
});

afterAll(async () => {
  await database?.pool.end();
  await testDb?.drop();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function probeCount(): Promise<number> {
  const result = await database.db.execute<{ n: number }>(sql`select count(*)::int as n from probe`);
  return result.rows[0].n;
}

describe('createDatabase', () => {
  it('풀 기반 실행 객체로 쿼리를 실행한다', async () => {
    const result = await database.db.execute<{ one: number }>(sql`select 1 as one`);
    expect(result.rows).toEqual([{ one: 1 }]);
  });

  it('트랜잭션 작업이 끝나면 커밋하고 결과를 반환한다', async () => {
    const before = await probeCount();
    const value = await database.withTransaction(async tx => {
      await tx.execute(sql`insert into probe (id) values ('tx-commit')`);
      return 'done';
    });
    expect(value).toBe('done');
    expect(await probeCount()).toBe(before + 1);
  });

  it('작업이 실패하면 롤백하고 오류를 전달하며 연결을 반환한다', async () => {
    const before = await probeCount();
    await expect(database.withTransaction(async tx => {
      await tx.execute(sql`insert into probe (id) values ('tx-rollback')`);
      throw new Error('work failed');
    })).rejects.toThrow('work failed');
    expect(await probeCount()).toBe(before);
    expect(database.pool.idleCount).toBe(1);
  });

  it('BEGIN이 실패하면 연결을 폐기하고 다음 트랜잭션은 새 연결로 실행한다', async () => {
    const backendPid = () => database.withTransaction(async tx =>
      (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
    const before = await backendPid();
    const original = Client.prototype.query;
    vi.spyOn(Client.prototype, 'query').mockImplementationOnce(function (this: Client) {
      return Promise.reject(new Error('begin failed'));
    } as typeof original);

    await expect(database.withTransaction(async () => 'never')).rejects.toThrow('begin failed');

    // 연결이 하나뿐인 풀에서 다른 서버 프로세스가 응답하면 실패한 연결을 폐기한 것이다.
    expect(await backendPid()).not.toBe(before);
  });

  it('작업이 오류를 삼켜 트랜잭션이 중단됐으면 커밋 대신 롤백된 사실을 오류로 알린다', async () => {
    await expect(database.withTransaction(async tx => {
      await tx.execute(sql`insert into probe (id) values ('aborted')`);
      await tx.execute(sql`select from missing_table_for_abort`).catch(() => undefined);
      return 'looks fine';
    })).rejects.toThrow('rolled back');
    const rows = await database.db.execute(sql`select 1 from probe where id = 'aborted'`);
    expect(rows.rows).toHaveLength(0);
  });

  it('unique 위반을 판정하고 다른 오류와 구분한다', async () => {
    await database.db.execute(sql`insert into probe (id) values ('dup')`);
    const unique = await database.db.execute(sql`insert into probe (id) values ('dup')`).catch((e: unknown) => e);
    const syntax = await database.db.execute(sql`select from nowhere_table`).catch((e: unknown) => e);
    expect(isUniqueViolation(unique)).toBe(true);
    expect(isUniqueViolation(syntax)).toBe(false);
    expect(isUniqueViolation(new Error('plain'))).toBe(false);
  });

  it('오류 요약은 코드와 대상 이름만 담고 쿼리 인자를 포함하지 않는다', async () => {
    const secret = 'secret-email@example.com';
    await database.db.execute(sql`insert into probe (id, email) values ('summary', ${secret})`);
    const error = await database.db.execute(sql`insert into probe (id, email) values ('summary', ${secret})`)
      .catch((e: unknown) => e);
    const summary = describeDbError(error);
    expect(summary).toMatchObject({ code: '23505', constraint: 'probe_pkey', table: 'probe' });
    expect(JSON.stringify(summary)).not.toContain(secret);
  });
});
