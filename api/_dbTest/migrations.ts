import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Client } from 'pg';

// 번호 SQL 마이그레이션을 번호 순서로 적용한다. down 파일은 제외한다.
const MIGRATIONS_DIR = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(name => /^\d{4}_.+\.sql$/.test(name) && !name.endsWith('.down.sql'))
    .sort();
}

export async function applySqlMigrations(client: Client): Promise<void> {
  for (const name of migrationFiles()) {
    try {
      await client.query(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'));
    } catch (e) {
      throw new Error(`마이그레이션 ${name} 적용에 실패했습니다: ${String(e)}`, { cause: e });
    }
  }
}
