// Drizzle 스키마가 번호 마이그레이션으로 만든 실제 표와 같은지 검사한다.
// 마이그레이션의 정본은 번호 SQL이고 Drizzle 스키마는 쿼리 작성용 선언이라, 어긋나면 여기서 실패한다.
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import * as schema from './schema.js';

let db: TestDatabase;
let client: Client;

beforeAll(async () => {
  db = await createTestDatabase();
  client = new Client({ connectionString: db.url });
  await client.connect();
});
afterAll(async () => {
  await client.end();
  await db.drop();
});

interface CatalogColumn { name: string; type: string; notNull: boolean; hasDefault: boolean }

async function catalog(table: string): Promise<CatalogColumn[]> {
  const { rows } = await client.query<{ name: string; type: string; nullable: string; def: string | null; ident: string }>(
    `select column_name as name, udt_name as type, is_nullable as nullable, column_default as def, is_identity as ident
     from information_schema.columns where table_schema = 'public' and table_name = $1 order by column_name`, [table]);
  return rows.map(r => ({ name: r.name, type: r.type, notNull: r.nullable === 'NO', hasDefault: r.def !== null || r.ident === 'YES' }));
}

// Drizzle 열 타입 → Postgres udt 이름
const UDT: Record<string, string> = {
  PgUUID: 'uuid', PgText: 'text', PgInteger: 'int4', PgBigInt53: 'int8', PgReal: 'float4',
  PgBoolean: 'bool', PgJsonb: 'jsonb', PgBigSerial53: 'int8',
};

const udtOf = (c: { columnType: string; withTimezone?: boolean }): string =>
  c.columnType === 'PgTimestamp' ? (c.withTimezone ? 'timestamptz' : 'timestamp') : UDT[c.columnType] ?? c.columnType;

const tables: PgTable[] = Object.values(schema);

describe('Drizzle 스키마', () => {
  it('서버가 쓰는 표를 모두 선언한다', () => {
    expect(tables.map(t => getTableConfig(t).name).sort()).toEqual([
      'bounty_accepts', 'bounty_progress', 'bounty_tickets', 'coupons', 'events', 'fish_instances',
      'letters', 'profiles', 'records', 'reliefs', 'saves', 'saves_current',
    ]);
  });

  it.each(tables.map(t => [getTableConfig(t).name, t] as const))('%s의 열 이름·타입·NOT NULL·기본값 유무가 실제 표와 같다', async (name, table) => {
    const declared = getTableConfig(table).columns.map(c => ({
      name: c.name, type: udtOf(c as unknown as { columnType: string; withTimezone?: boolean }), notNull: c.notNull, hasDefault: c.hasDefault,
    })).sort((a, b) => a.name.localeCompare(b.name));
    expect(declared).toEqual(await catalog(name));
  });
});
