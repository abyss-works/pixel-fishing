// 빈 익명 계정 정리 저장 모듈을 실제 Postgres에서 검사한다. 대상 선정 조건과 계정 단위 삭제를 고정한다.
// 시각은 고정 기준(NOW)에서 며칠 전인지로 만들고, 선정 조건의 컷오프(NOW 7일 전)는 인자로 넘긴다.
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { GONE, USER_TABLES, rowCounts, seedAccount, seedFullAccount, seeded } from '../_dbTest/accountFixtures.js';
import type { AccountSpec } from '../_dbTest/accountFixtures.js';
import { testUid } from '../_dbTest/actionHarness.js';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import { purgeAccount, selectPurgeTargets } from './account.js';

const NOW = Date.parse('2030-03-04T05:06:07.000Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const CUTOFF = ago(7);

interface Case { key: string; name: string; target: boolean; spec: AccountSpec }

const CASES: Case[] = [
  { key: 'idle', name: '익명이고 골드·명성이 0이며 마지막 활동이 7일보다 오래됐으면 대상이다', target: true,
    spec: { save: { updatedAt: ago(10) }, createdAt: ago(30), lastSignInAt: ago(12) } },
  { key: 'noSave', name: '익명이고 저장이 없으며 가입과 로그인이 모두 오래됐으면 대상이다', target: true,
    spec: { save: null, createdAt: ago(30), lastSignInAt: ago(20) } },
  { key: 'noSaveNoSignIn', name: '익명이고 저장과 로그인 시각이 없으며 가입이 오래됐으면 대상이다', target: true,
    spec: { save: null, createdAt: ago(9), lastSignInAt: null } },
  { key: 'justOver', name: '마지막 활동이 컷오프보다 1초 이르면 대상이다', target: true,
    spec: { save: { updatedAt: new Date(Date.parse(CUTOFF) - 1000).toISOString() }, createdAt: ago(30), lastSignInAt: ago(30) } },
  { key: 'atCutoff', name: '마지막 활동이 컷오프와 같으면 대상이 아니다', target: false,
    spec: { save: { updatedAt: CUTOFF }, createdAt: ago(30), lastSignInAt: ago(30) } },
  { key: 'gold', name: '익명이어도 골드가 있으면 대상이 아니다', target: false,
    spec: { save: { gold: 5, updatedAt: ago(10) }, createdAt: ago(30), lastSignInAt: ago(30) } },
  { key: 'fame', name: '익명이어도 명성이 있으면 대상이 아니다', target: false,
    spec: { save: { fame: 5, updatedAt: ago(10) }, createdAt: ago(30), lastSignInAt: ago(30) } },
  { key: 'recentSave', name: '저장이 7일 안에 갱신됐으면 대상이 아니다', target: false,
    spec: { save: { updatedAt: ago(2) }, createdAt: ago(30), lastSignInAt: ago(20) } },
  { key: 'recentSignIn', name: '저장은 오래됐어도 로그인이 7일 안이면 대상이 아니다', target: false,
    spec: { save: { updatedAt: ago(10) }, createdAt: ago(30), lastSignInAt: ago(1) } },
  { key: 'recentCreated', name: '저장이 없고 가입이 7일 안이면 대상이 아니다', target: false,
    spec: { save: null, createdAt: ago(2), lastSignInAt: null } },
  { key: 'unknownTimes', name: '활동 시각을 알 수 없으면 대상이 아니다', target: false,
    spec: { save: null, createdAt: null, lastSignInAt: null } },
  { key: 'email', name: '이메일 계정은 골드·명성이 0이고 오래돼도 대상이 아니다', target: false,
    spec: { email: 'player@example.test', save: { updatedAt: ago(10) }, createdAt: ago(30), lastSignInAt: ago(30) } },
  { key: 'anonymousWithEmail', name: '익명이라도 이메일이 붙은 계정은 대상이 아니다', target: false,
    spec: { anonymous: true, email: 'upgrading@example.test', save: { updatedAt: ago(10) }, createdAt: ago(30), lastSignInAt: ago(30) } },
  { key: 'pendingEmail', name: '이메일 변경 확인을 기다리는 익명 계정은 대상이 아니다', target: false,
    spec: { pendingEmail: 'pending@example.test', save: { updatedAt: ago(10) }, createdAt: ago(30), lastSignInAt: ago(30) } },
  { key: 'restricted', name: '제재 계정은 대상이 아니다', target: false,
    spec: { save: { updatedAt: ago(10), restricted: true }, createdAt: ago(30), lastSignInAt: ago(30) } },
  { key: 'admin', name: '관리자는 대상이 아니다', target: false,
    spec: { save: { updatedAt: ago(10) }, createdAt: ago(30), lastSignInAt: ago(30), admin: true } },
  { key: 'legacyOnly', name: 'saves_current 없이 구 saves 행만 있는 계정은 대상이 아니다', target: false,
    spec: { save: null, createdAt: ago(60), lastSignInAt: ago(60), legacySave: true } },
];

describe('빈 익명 계정 대상 선정', () => {
  let testDb: TestDatabase;
  let client: Client;
  let database: Database;
  const uids = new Map<string, string>();
  let selected: { total: number; ids: string[] };

  beforeAll(async () => {
    testDb = await createTestDatabase();
    client = new Client({ connectionString: testDb.url });
    await client.connect();
    database = createDatabase({ connectionString: testDb.url, max: 2 });
    for (const c of CASES) uids.set(c.key, await seedAccount(client, c.spec));
    selected = await selectPurgeTargets(database.db, CUTOFF, 500);
  });
  afterAll(async () => {
    await database?.pool.end();
    await client?.end();
    await testDb?.drop();
  });

  it.each(CASES.map(c => [c.name, c.key, c.target] as const))('%s', (_name, key, target) => {
    expect(selected.ids.includes(uids.get(key)!)).toBe(target);
  });

  it('전체 대상 수를 알려 주고, 상한만큼 마지막 활동이 오래된 계정부터 돌려준다', async () => {
    const targets = CASES.filter(c => c.target).map(c => uids.get(c.key)!);
    expect(selected.total).toBe(targets.length);
    expect([...selected.ids].sort()).toEqual([...targets].sort());

    const capped = await selectPurgeTargets(database.db, CUTOFF, 2);
    expect(capped.total).toBe(targets.length);
    // 마지막 활동은 noSave 20일 전, idle 10일 전, noSaveNoSignIn 9일 전, justOver 7일 전보다 1초 이전이다
    expect(capped.ids).toEqual([uids.get('noSave'), uids.get('idle')]);
  });

  it('대상이 없으면 0과 빈 목록이다', async () => {
    expect(await selectPurgeTargets(database.db, ago(3650), 500)).toEqual({ total: 0, ids: [] });
  });
});

/** 운영 확인 상태를 만든다. 공개 표를 auth.users에 묶는 외래 키를 모두 지운다 */
const DROP_FOREIGN_KEYS = `do $$ declare r record; begin
  for r in select conrelid::regclass as tbl, conname from pg_constraint where contype = 'f' and confrelid = 'auth.users'::regclass
  loop execute format('alter table %s drop constraint %I', r.tbl, r.conname); end loop;
end $$`;

const IDLE: AccountSpec = { save: { updatedAt: ago(10) }, createdAt: ago(30), lastSignInAt: ago(12) };

describe.each([
  { label: '마이그레이션 그대로, 외래 키 있음', dropForeignKeys: false },
  { label: '운영 확인 상태, 외래 키 없음', dropForeignKeys: true },
])('계정 단위 삭제($label)', ({ dropForeignKeys }) => {
  let testDb: TestDatabase;
  let client: Client;
  let database: Database;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    client = new Client({ connectionString: testDb.url });
    await client.connect();
    database = createDatabase({ connectionString: testDb.url, max: 2 });
    if (dropForeignKeys) {
      await client.query(DROP_FOREIGN_KEYS);
      const { rows } = await client.query(`select 1 from pg_constraint where contype = 'f' and confrelid = 'auth.users'::regclass`);
      expect(rows).toHaveLength(0);
    }
  });
  afterAll(async () => {
    await database?.pool.end();
    await client?.end();
    await testDb?.drop();
  });

  it('모든 공개 표의 행과 인증 계정을 지우고 다른 계정은 그대로 둔다', async () => {
    const target = await seedFullAccount(client, { ...IDLE, nickname: '지울계정' });
    const other = await seedFullAccount(client, { ...IDLE, nickname: '남길계정' });
    expect(await rowCounts(client, target)).toEqual(seeded(true));

    expect(await purgeAccount(database.withTransaction, target, CUTOFF)).toBe(true);

    expect(await rowCounts(client, target)).toEqual(GONE);
    expect(await rowCounts(client, other)).toEqual(seeded(true));
  });

  it('저장 없는 계정도 프로필·이벤트·편지·현상금 행과 함께 지운다', async () => {
    const target = await seedFullAccount(client, { save: null, createdAt: ago(30), lastSignInAt: ago(20), nickname: '저장없음' });
    expect(await rowCounts(client, target)).toEqual(seeded(false));

    expect(await purgeAccount(database.withTransaction, target, CUTOFF)).toBe(true);

    expect(await rowCounts(client, target)).toEqual(GONE);
  });

  it('지원 코드 행은 지우지 않고 수령자 기록을 남긴다', async () => {
    const target = await seedFullAccount(client, { ...IDLE, nickname: '수령자' });
    await client.query(`insert into public.reliefs (code, claimed_by, active) values ('R-AUDIT', $1, false)`, [target]);

    expect(await purgeAccount(database.withTransaction, target, CUTOFF)).toBe(true);

    const { rows } = await client.query('select claimed_by, active from public.reliefs where code = $1', ['R-AUDIT']);
    expect(rows).toEqual([{ claimed_by: target, active: false }]);
  });

  it('조건에서 벗어난 계정은 아무것도 지우지 않고 false를 돌려준다', async () => {
    const withGold = await seedFullAccount(client, { ...IDLE, save: { gold: 3, updatedAt: ago(10) }, nickname: '골드' });
    const active = await seedFullAccount(client, { ...IDLE, save: { updatedAt: ago(1) }, nickname: '최근' });
    const email = await seedFullAccount(client, { ...IDLE, email: 'mail@example.test', nickname: '메일' });
    const admin = await seedFullAccount(client, { ...IDLE, admin: true, nickname: '관리' });

    for (const uid of [withGold, active, email, admin]) {
      expect(await purgeAccount(database.withTransaction, uid, CUTOFF)).toBe(false);
      expect(await rowCounts(client, uid)).toEqual(seeded(true));
    }
  });

  it('없는 계정은 false다', async () => {
    expect(await purgeAccount(database.withTransaction, testUid(999_000), CUTOFF)).toBe(false);
  });
});

describe('계정 단위 삭제의 원자성과 동시성', () => {
  let testDb: TestDatabase;
  let client: Client;
  let writer: Client;
  let database: Database;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    client = new Client({ connectionString: testDb.url });
    writer = new Client({ connectionString: testDb.url });
    await client.connect();
    await writer.connect();
    database = createDatabase({ connectionString: testDb.url, max: 2 });
  });
  afterAll(async () => {
    await database?.pool.end();
    await writer?.end();
    await client?.end();
    await testDb?.drop();
  });

  it('삭제 도중 실패하면 그 계정의 모든 행이 그대로 남는다', async () => {
    const target = await seedFullAccount(client, { ...IDLE, nickname: '실패' });
    // 인증 계정 앞에서 마지막으로 지우는 saves_current 삭제를 실패시킨다
    await client.query(`create function public.test_block_delete() returns trigger language plpgsql as $$
      begin raise exception 'blocked for test'; end $$`);
    await client.query(`create trigger test_block_delete before delete on public.saves_current
      for each row execute function public.test_block_delete()`);
    try {
      await expect(purgeAccount(database.withTransaction, target, CUTOFF)).rejects.toThrow();
    } finally {
      await client.query('drop trigger test_block_delete on public.saves_current');
      await client.query('drop function public.test_block_delete()');
    }
    expect(await rowCounts(client, target)).toEqual(seeded(true));
  });

  it('액션 확정이 저장 행을 쓰는 중이면 끝난 뒤 다시 확인하고 지우지 않는다', async () => {
    const target = await seedFullAccount(client, { ...IDLE, nickname: '동시' });
    // 다른 연결이 저장 행을 갱신하는 트랜잭션을 연 채로 둔다
    await writer.query('begin');
    await writer.query('update public.saves_current set gold = 7, version = version + 1, updated_at = $2 where user_id = $1',
      [target, ago(0)]);

    let settled = false;
    const purging = purgeAccount(database.withTransaction, target, CUTOFF).finally(() => { settled = true; });
    // 정리 트랜잭션이 저장 행 잠금을 기다리는 상태가 될 때까지 기다린다
    for (let i = 0; i < 100; i++) {
      const { rows } = await client.query(
        `select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`);
      if (rows.length > 0) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    expect(settled).toBe(false);

    await writer.query('commit');
    expect(await purging).toBe(false);

    expect(await rowCounts(client, target)).toEqual(seeded(true));
    const { rows } = await client.query('select gold from public.saves_current where user_id = $1', [target]);
    expect(Number(rows[0].gold)).toBe(7);
  });
});

describe('공개 표 목록', () => {
  let testDb: TestDatabase;
  let client: Client;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    client = new Client({ connectionString: testDb.url });
    await client.connect();
  });
  afterAll(async () => {
    await client?.end();
    await testDb?.drop();
  });

  it('user_id 열을 가진 공개 표는 모두 계정 정리가 비우는 목록에 있다. 관리자 명부는 대상이 아니라 제외한다', async () => {
    const { rows } = await client.query<{ table_name: string }>(
      `select c.table_name from information_schema.columns c
       join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
       where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE'`);
    expect(rows.map(r => r.table_name).sort()).toEqual([...USER_TABLES, 'admins'].sort());
  });
});
