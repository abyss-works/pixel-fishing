import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Client } from 'pg';

const MIGRATION_FILE_PATTERN = /^\d{4}_.+\.sql$/;
const MIGRATION_LOCK_KEY = 724_917_003;
const DEFAULT_MIGRATION_ROLE = 'app';
const ROLELESS_MIGRATIONS = new Set(['0011_pgrst_max_rows.sql']);

export interface MigrationRunResult {
  applied: string[];
  skipped: number;
}

export interface MigrationRunOptions {
  migrationsDir: string;
  role?: string;
}

export type LedgerStateAction = 'use-existing-ledger' | 'create-ledger' | 'abort-existing-database';

/** up 마이그레이션 파일만 번호 순서로 남긴다. */
export function filterMigrationFileNames(names: string[]): string[] {
  return names
    .filter(name => MIGRATION_FILE_PATTERN.test(name) && !name.endsWith('.down.sql'))
    .sort();
}

/** ledger에 기록된 파일을 빼고 아직 적용할 파일만 남긴다. */
export function planMigrationFiles(files: string[], applied: ReadonlySet<string>): string[] {
  return files.filter(name => !applied.has(name));
}

/** ledger가 없을 때 빈 데이터베이스와 기존 데이터베이스를 구분한다. */
export function ledgerStateAction(hasLedger: boolean, hasSavesCurrent: boolean): LedgerStateAction {
  if (hasLedger) return 'use-existing-ledger';
  return hasSavesCurrent ? 'abort-existing-database' : 'create-ledger';
}

/** 역할을 바꾸면 실행할 수 없는 엔진 설정 파일만 예외로 둔다. */
export function usesMigrationRole(name: string): boolean {
  return !ROLELESS_MIGRATIONS.has(name);
}

/** 인자와 환경 변수에서 마이그레이션 객체 소유 역할을 고른다. */
export function resolveMigrationRole(role?: string, envRole?: string): string {
  const resolved = role ?? envRole ?? DEFAULT_MIGRATION_ROLE;
  if (resolved.length === 0) throw new Error('마이그레이션 역할 이름이 비어 있습니다');
  return resolved;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function tableExists(client: Client, name: string): Promise<boolean> {
  const { rows } = await client.query<{ present: string | null }>('select to_regclass($1)::text as present', [name]);
  return rows.length > 0 && rows[0].present !== null;
}

async function rollbackAndResetRole(client: Client): Promise<void> {
  await client.query('rollback').catch(() => undefined);
  await client.query('reset role').catch(() => undefined);
}

async function createLedger(client: Client, role: string): Promise<void> {
  try {
    await client.query('begin');
    await client.query(`set role ${quoteIdentifier(role)}`);
    await client.query(`
      create table if not exists public.schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `);
    await client.query('alter table public.schema_migrations enable row level security');
    await client.query('reset role');
    await client.query('commit');
  } catch (error) {
    await rollbackAndResetRole(client);
    throw new Error(`마이그레이션 ledger 생성에 실패했습니다: ${errorMessage(error)}`, { cause: error });
  }
}

async function applyMigrationFile(client: Client, migrationsDir: string, name: string, role: string): Promise<void> {
  let sql: string;
  try {
    sql = await readFile(join(migrationsDir, name), 'utf8');
  } catch (error) {
    throw new Error(`마이그레이션 ${name} 읽기에 실패했습니다: ${errorMessage(error)}`, { cause: error });
  }

  try {
    await client.query('begin');
    if (usesMigrationRole(name)) {
      await client.query(`set role ${quoteIdentifier(role)}`);
    }
    await client.query(sql);
    if (usesMigrationRole(name)) {
      // 파일 안의 객체 생성은 지정 역할로 하고, ledger 갱신은 연결 사용자 권한으로 둔다.
      await client.query('reset role');
    }
    await client.query('insert into public.schema_migrations (name) values ($1) on conflict do nothing', [name]);
    await client.query('commit');
  } catch (error) {
    await rollbackAndResetRole(client);
    throw new Error(`마이그레이션 ${name} 적용에 실패했습니다: ${errorMessage(error)}`, { cause: error });
  }
}

/**
 * 번호 마이그레이션을 파일마다 한 트랜잭션으로 적용한다.
 * advisory lock으로 같은 데이터베이스에서 동시에 하나만 실행되게 한다.
 */
export async function runMigrations(client: Client, options: MigrationRunOptions): Promise<MigrationRunResult> {
  const files = filterMigrationFileNames(await readdir(options.migrationsDir));
  const role = resolveMigrationRole(options.role, process.env.MIGRATION_ROLE);
  const appliedNames: string[] = [];
  let skipped = 0;
  let locked = false;
  let failure: unknown;

  try {
    await client.query('select pg_advisory_lock($1::bigint)', [MIGRATION_LOCK_KEY]);
    locked = true;

    const hasLedger = await tableExists(client, 'public.schema_migrations');
    const hasSavesCurrent = await tableExists(client, 'public.saves_current');
    const action = ledgerStateAction(hasLedger, hasSavesCurrent);
    if (action === 'abort-existing-database') {
      throw new Error('public.schema_migrations가 없고 public.saves_current가 있는 기존 데이터베이스입니다. 전체 마이그레이션 재적용을 막기 위해 중단합니다. 기준선 마이그레이션을 먼저 적용해야 합니다');
    }
    if (action === 'create-ledger') {
      await createLedger(client, role);
    }

    const { rows } = await client.query<{ name: string }>('select name from public.schema_migrations');
    const pending = planMigrationFiles(files, new Set(rows.map(row => row.name)));
    skipped = files.length - pending.length;

    for (const name of pending) {
      await applyMigrationFile(client, options.migrationsDir, name, role);
      appliedNames.push(name);
    }
  } catch (error) {
    failure = error;
  }

  if (locked) {
    try {
      await client.query('select pg_advisory_unlock($1::bigint)', [MIGRATION_LOCK_KEY]);
    } catch (error) {
      if (failure === undefined) {
        failure = new Error(`마이그레이션 잠금 해제에 실패했습니다: ${errorMessage(error)}`, { cause: error });
      }
    }
  }

  if (failure !== undefined) throw failure;
  return { applied: appliedNames, skipped };
}
