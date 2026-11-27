import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyDatabase } from './_dbTest/testDatabase.js';
import type { TestDatabase } from './_dbTest/testDatabase.js';
import { filterMigrationFileNames, runMigrations } from './_server/migrationRunner.js';

let db: TestDatabase;
let client: Client;
let dir: string;

async function writeMigration(name: string, sql: string): Promise<void> {
  await writeFile(join(dir, name), sql);
}

async function tableExists(name: string): Promise<boolean> {
  const { rows } = await client.query<{ present: string | null }>('select to_regclass($1)::text as present', [`public.${name}`]);
  return rows[0].present !== null;
}


async function createLedger(): Promise<void> {
  await client.query(`
    create table public.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function ledgerNames(): Promise<string[]> {
  const { rows } = await client.query<{ name: string }>('select name from public.schema_migrations order by name');
  return rows.map(row => row.name);
}

beforeEach(async () => {
  db = await createEmptyDatabase();
  client = new Client({ connectionString: db.url });
  await client.connect();
  dir = await mkdtemp(join(tmpdir(), 'pixel-fishing-migrations-'));
  // 빈 데이터베이스에서 역할 전환 경로도 같이 지나가게 postgres 역할을 명시한다.
  vi.stubEnv('MIGRATION_ROLE', 'postgres');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
  await client.end();
  await db.drop();
});

describe('마이그레이션 runner', () => {
  it('기준선 ledger가 있으면 두 파일을 순서대로 적용하고 기록한다', async () => {
    await createLedger();
    await writeMigration('0001_create_order.sql', `
      create table public.runner_order (n integer primary key);
      insert into public.runner_order (n) values (1);
    `);
    await writeMigration('0002_fill_order.sql', `
      insert into public.runner_order (n) values (2);
    `);

    const result = await runMigrations(client, { migrationsDir: dir });

    expect(result).toEqual({ applied: ['0001_create_order.sql', '0002_fill_order.sql'], skipped: 0 });
    expect((await client.query<{ n: number }>('select n from public.runner_order order by n')).rows.map(row => row.n)).toEqual([1, 2]);
    expect(await ledgerNames()).toEqual(['0001_create_order.sql', '0002_fill_order.sql']);
  });

  it('다시 실행하면 이미 적용된 파일은 건너뛰고 새 파일만 적용한다', async () => {
    await createLedger();
    await writeMigration('0001_create_order.sql', 'create table public.runner_order (n integer primary key)');
    await writeMigration('0002_seed_order.sql', 'insert into public.runner_order (n) values (1)');
    await runMigrations(client, { migrationsDir: dir, role: 'postgres' });
    await writeMigration('0003_add_order.sql', 'insert into public.runner_order (n) values (2)');

    const result = await runMigrations(client, { migrationsDir: dir, role: 'postgres' });

    expect(result).toEqual({ applied: ['0003_add_order.sql'], skipped: 2 });
    expect((await client.query<{ n: number }>('select n from public.runner_order order by n')).rows.map(row => row.n)).toEqual([1, 2]);
    expect(await ledgerNames()).toEqual(['0001_create_order.sql', '0002_seed_order.sql', '0003_add_order.sql']);
  });

  it('두 번째 파일이 실패하면 그 파일의 객체와 ledger 행을 롤백한다', async () => {
    await createLedger();
    await writeMigration('0001_create_order.sql', 'create table public.runner_order (n integer primary key)');
    await writeMigration('0002_bad.sql', `
      create table public.runner_bad_rollback (n integer);
      insert into public.no_such_table values (1);
    `);

    await expect(runMigrations(client, { migrationsDir: dir, role: 'postgres' })).rejects.toThrow(/0002_bad\.sql/);

    expect(await tableExists('runner_order')).toBe(true);
    expect(await tableExists('runner_bad_rollback')).toBe(false);
    expect(await ledgerNames()).toEqual(['0001_create_order.sql']);
  });

  it('ledger가 없으면 데이터베이스 상태와 관계없이 중단한다', async () => {
    await client.query('create table public.saves_current (user_id uuid primary key)');
    await writeMigration('0001_create_order.sql', 'create table public.runner_order (n integer primary key)');

    await expect(runMigrations(client, { migrationsDir: dir, role: 'postgres' })).rejects.toThrow(/schema_migrations/);

    expect(await tableExists('runner_order')).toBe(false);
    expect(await tableExists('schema_migrations')).toBe(false);
  });

  it('0062는 현재 up 마이그레이션 전체를 기준선으로 기록하고 서버 전용 RLS를 켠다', async () => {
    const migrationsDir = join(import.meta.dirname, '..', 'supabase', 'migrations');
    await client.query(await readFile(join(migrationsDir, '0062_schema_migrations.sql'), 'utf8'));

    const expected = filterMigrationFileNames(await readdir(migrationsDir));
    expect(await ledgerNames()).toEqual(expected);
    const { rows: rlsRows } = await client.query<{ enabled: boolean }>(
      `select relrowsecurity as enabled from pg_class where oid = 'public.schema_migrations'::regclass`);
    expect(rlsRows).toEqual([{ enabled: true }]);
    const { rows: policyRows } = await client.query<{ count: number }>(
      `select count(*)::integer as count from pg_policies where schemaname = 'public' and tablename = 'schema_migrations'`);
    expect(policyRows[0].count).toBe(0);

    await client.query(await readFile(join(migrationsDir, '0062_schema_migrations.down.sql'), 'utf8'));
    expect(await tableExists('schema_migrations')).toBe(false);
  });
});
