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
import { purgeAccount, purgeCutoffs, selectPurgeTargets } from './account.js';

const NOW = Date.parse('2030-03-04T05:06:07.000Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const CUTOFF = ago(7);
const CUTOFFS = { idle: CUTOFF, stale: ago(365) };

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
  { key: 'email', name: '이메일 계정은 골드·명성이 0이고 오래돼도 대상이 아니다', target: false,
    spec: { email: 'player@example.test', save: { updatedAt: ago(10) }, createdAt: ago(30), lastSignInAt: ago(30) } },
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
  let selected: { total: number; stale: number; ids: string[] };

  beforeAll(async () => {
    testDb = await createTestDatabase();
    client = new Client({ connectionString: testDb.url });
    await client.connect();
    database = createDatabase({ connectionString: testDb.url, max: 2 });
    for (const c of CASES) uids.set(c.key, await seedAccount(client, c.spec));
    selected = await selectPurgeTargets(database.db, CUTOFFS, 500);
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
    expect(selected.stale).toBe(0);
    expect([...selected.ids].sort()).toEqual([...targets].sort());

    const capped = await selectPurgeTargets(database.db, CUTOFFS, 2);
    expect(capped.total).toBe(targets.length);
    // 마지막 활동은 noSave 20일 전, idle 10일 전, noSaveNoSignIn 9일 전, justOver 7일 전보다 1초 이전이다
    expect(capped.ids).toEqual([uids.get('noSave'), uids.get('idle')]);
  });

  it('대상이 없으면 0과 빈 목록이다', async () => {
    expect(await selectPurgeTargets(database.db, { idle: ago(3650), stale: ago(3650) }, 500)).toEqual({ total: 0, stale: 0, ids: [] });
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

    expect(await purgeAccount(database.withTransaction, target, CUTOFFS)).toBe(true);

    expect(await rowCounts(client, target)).toEqual(GONE);
    expect(await rowCounts(client, other)).toEqual(seeded(true));
  });

  it('저장 없는 계정도 프로필·이벤트·편지·현상금 행과 함께 지운다', async () => {
    const target = await seedFullAccount(client, { save: null, createdAt: ago(30), lastSignInAt: ago(20), nickname: '저장없음' });
    expect(await rowCounts(client, target)).toEqual(seeded(false));

    expect(await purgeAccount(database.withTransaction, target, CUTOFFS)).toBe(true);

    expect(await rowCounts(client, target)).toEqual(GONE);
  });

  it('지원 코드 행은 지우지 않고 수령자 기록을 남긴다', async () => {
    const target = await seedFullAccount(client, { ...IDLE, nickname: '수령자' });
    await client.query(`insert into public.reliefs (code, claimed_by, active) values ('R-AUDIT', $1, false)`, [target]);

    expect(await purgeAccount(database.withTransaction, target, CUTOFFS)).toBe(true);

    const { rows } = await client.query('select claimed_by, active from public.reliefs where code = $1', ['R-AUDIT']);
    expect(rows).toEqual([{ claimed_by: target, active: false }]);
  });

  it('조건에서 벗어난 계정은 아무것도 지우지 않고 false를 돌려준다', async () => {
    const withGold = await seedFullAccount(client, { ...IDLE, save: { gold: 3, updatedAt: ago(10) }, nickname: '골드' });
    const active = await seedFullAccount(client, { ...IDLE, save: { updatedAt: ago(1) }, nickname: '최근' });
    const email = await seedFullAccount(client, { ...IDLE, email: 'mail@example.test', nickname: '메일' });
    const admin = await seedFullAccount(client, { ...IDLE, admin: true, nickname: '관리' });

    for (const uid of [withGold, active, email, admin]) {
      expect(await purgeAccount(database.withTransaction, uid, CUTOFFS)).toBe(false);
      expect(await rowCounts(client, uid)).toEqual(seeded(true));
    }
  });

  it('편지를 보낸 계정은 대상이 아니고 지우지 않는다', async () => {
    const writer = await seedFullAccount(client, { ...IDLE, letter: true, nickname: '편지' });
    expect((await selectPurgeTargets(database.db, CUTOFFS, 500)).ids).not.toContain(writer);
    expect(await purgeAccount(database.withTransaction, writer, CUTOFFS)).toBe(false);
    expect(await rowCounts(client, writer)).toEqual(seeded(true, true));
  });

  it('없는 계정은 false다', async () => {
    expect(await purgeAccount(database.withTransaction, testUid(999_000), CUTOFFS)).toBe(false);
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
      await expect(purgeAccount(database.withTransaction, target, CUTOFFS)).rejects.toThrow();
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
    const purging = purgeAccount(database.withTransaction, target, CUTOFFS).finally(() => { settled = true; });
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

const STALE = ago(365);
const beforeStale = (seconds: number) => new Date(Date.parse(STALE) - seconds * 1000).toISOString();
const OLD = ago(500);

const STALE_CASES: Case[] = [
  { key: 'progress', name: '골드와 명성이 있어도 마지막 접속이 1년보다 오래됐으면 대상이다', target: true,
    spec: { save: { gold: 5000, fame: 80, updatedAt: ago(366) }, createdAt: OLD, lastSignInAt: ago(366) } },
  { key: 'dayAfter', name: '모든 접속 근거가 365일보다 하루 뒤(366일 전)면 대상이다', target: true,
    spec: { save: { gold: 10, updatedAt: ago(366) }, createdAt: ago(366), lastSignInAt: ago(366) } },
  { key: 'oneSecondOver', name: '모든 접속 근거가 기준보다 1초 이르면 대상이다', target: true,
    spec: { save: { gold: 10, updatedAt: beforeStale(1) }, createdAt: beforeStale(1), lastSignInAt: beforeStale(1) } },
  { key: 'onDay', name: '마지막 접속이 정확히 365일 전이면 대상이 아니다', target: false,
    spec: { save: { gold: 10, updatedAt: STALE }, createdAt: STALE, lastSignInAt: STALE } },
  { key: 'dayBefore', name: '마지막 접속이 364일 전이면 대상이 아니다', target: false,
    spec: { save: { gold: 10, updatedAt: ago(364) }, createdAt: OLD, lastSignInAt: ago(364) } },
  { key: 'recentSession', name: '저장은 오래됐어도 세션 사용이 365일 안이면 대상이 아니다', target: false,
    spec: { save: { gold: 10, updatedAt: OLD }, createdAt: OLD, lastSignInAt: ago(364) } },
  { key: 'recentSave', name: '세션은 오래됐어도 저장 갱신이 365일 안이면 대상이 아니다', target: false,
    spec: { save: { gold: 10, updatedAt: ago(364) }, createdAt: OLD, lastSignInAt: OLD } },
  { key: 'recentLegacySave', name: '구 저장 표의 저장 시각이 365일 안이면 대상이 아니다', target: false,
    spec: { save: { gold: 10, updatedAt: OLD }, legacySave: true, legacySaveAt: ago(364), createdAt: OLD, lastSignInAt: OLD } },
  { key: 'recentSignUp', name: '저장 갱신과 세션이 1년보다 오래됐어도 가입이 365일 안이면 대상이 아니다', target: false,
    spec: { save: { gold: 10, updatedAt: OLD }, createdAt: ago(364), lastSignInAt: OLD } },
  { key: 'onlySignUp', name: '저장과 세션이 없고 가입이 1년보다 오래됐으면 대상이다', target: true,
    spec: { save: null, createdAt: OLD, lastSignInAt: null } },
  { key: 'legacyOnly', name: 'saves_current 없이 구 저장만 있어도 모든 접속 근거가 1년보다 오래됐으면 대상이다', target: true,
    spec: { save: null, legacySave: true, legacySaveAt: OLD, createdAt: OLD, lastSignInAt: OLD } },
  { key: 'linked', name: '연결된 계정(익명이 아닌 계정)은 오래돼도 대상이 아니다', target: false,
    spec: { email: 'linked@example.test', save: { gold: 10, updatedAt: OLD }, createdAt: OLD, lastSignInAt: OLD } },
  { key: 'restricted', name: '제재된 게스트는 대상이 아니다', target: false,
    spec: { save: { gold: 10, updatedAt: OLD, restricted: true }, createdAt: OLD, lastSignInAt: OLD } },
  { key: 'admin', name: '관리자는 대상이 아니다', target: false,
    spec: { save: { gold: 10, updatedAt: OLD }, createdAt: OLD, lastSignInAt: OLD, admin: true } },
  { key: 'idleLegacyRecent', name: '빈 게스트도 구 저장 표의 저장 시각이 7일 안이면 대상이 아니다', target: false,
    spec: { save: { updatedAt: ago(10) }, legacySave: true, legacySaveAt: ago(2), createdAt: ago(30), lastSignInAt: ago(12) } },
];

describe('1년 동안 접속하지 않은 게스트 대상 선정', () => {
  let testDb: TestDatabase;
  let client: Client;
  let database: Database;
  const uids = new Map<string, string>();
  let selected: { total: number; stale: number; ids: string[] };

  beforeAll(async () => {
    testDb = await createTestDatabase();
    client = new Client({ connectionString: testDb.url });
    await client.connect();
    database = createDatabase({ connectionString: testDb.url, max: 2 });
    for (const c of STALE_CASES) uids.set(c.key, await seedAccount(client, c.spec));
    const writer = await seedAccount(client, { save: { gold: 10, updatedAt: OLD }, createdAt: OLD, lastSignInAt: OLD });
    await client.query(`insert into public.letters (user_id, text) values ($1, '편지')`, [writer]);
    uids.set('letter', writer);
    selected = await selectPurgeTargets(database.db, CUTOFFS, 500);
  });
  afterAll(async () => {
    await database?.pool.end();
    await client?.end();
    await testDb?.drop();
  });

  it.each(STALE_CASES.map(c => [c.name, c.key, c.target] as const))('%s', (_name, key, target) => {
    expect(selected.ids.includes(uids.get(key)!)).toBe(target);
  });

  it('편지를 보낸 게스트는 오래돼도 대상이 아니다', () => {
    expect(selected.ids).not.toContain(uids.get('letter'));
  });

  it('전체 대상 수와 1년 규칙으로 고른 수를 알려 준다', () => {
    const targets = STALE_CASES.filter(c => c.target).length;
    expect(selected.total).toBe(targets);
    expect(selected.stale).toBe(targets);
  });

  it('7일 규칙 대상과 1년 규칙 대상을 구분해 센다', async () => {
    const idle = await seedAccount(client, { save: { updatedAt: ago(10) }, createdAt: ago(30), lastSignInAt: ago(12) });
    const counts = await selectPurgeTargets(database.db, CUTOFFS, 500);
    expect(counts.ids).toContain(idle);
    expect(counts.total).toBe(selected.total + 1);
    expect(counts.stale).toBe(selected.stale);
  });

  it('상한이 있으면 마지막 접속이 가장 오래된 계정부터 고른다', async () => {
    const capped = await selectPurgeTargets(database.db, CUTOFFS, 1);
    // 가입과 모든 접속 근거가 500일 전인 계정 가운데 id가 작은 쪽이 먼저다
    const oldest = ['onlySignUp', 'legacyOnly'].map(k => uids.get(k)!).sort()[0];
    expect(capped.ids).toEqual([oldest]);
  });
});

describe('1년 동안 접속하지 않은 게스트 삭제', () => {
  let testDb: TestDatabase;
  let client: Client;
  let database: Database;
  const STALE_GUEST: AccountSpec = { save: { gold: 5000, fame: 80, updatedAt: OLD }, createdAt: OLD, lastSignInAt: OLD };

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

  it('진행이 있는 게스트의 모든 공개 표 행과 인증 계정을 본인 탈퇴와 같은 범위로 지우고 다른 계정은 그대로 둔다', async () => {
    const target = await seedFullAccount(client, { ...STALE_GUEST, nickname: '오래된게스트' });
    const other = await seedFullAccount(client, { ...STALE_GUEST, email: 'linked-full@example.test', nickname: '연결계정' });
    expect(await rowCounts(client, target)).toEqual(seeded(true));

    expect(await purgeAccount(database.withTransaction, target, CUTOFFS)).toBe(true);
    expect(await rowCounts(client, target)).toEqual(GONE);
    expect(await rowCounts(client, other)).toEqual(seeded(true));

    // 이미 지운 계정을 다시 지우려 하면 아무 일도 없다
    expect(await purgeAccount(database.withTransaction, target, CUTOFFS)).toBe(false);
  });

  it('다른 플레이어가 있는 길드의 구성원이었다면 그 길드와 다른 구성원은 그대로 두고 길드장이면 넘긴다', async () => {
    const guest = await seedAccount(client, STALE_GUEST);
    const member = await seedAccount(client, { email: 'member@example.test', save: { gold: 1, updatedAt: ago(1) }, createdAt: OLD, lastSignInAt: ago(1) });
    const { rows: [guild] } = await client.query<{ id: string }>(
      `insert into public.guilds (name, code) values ('남는길드', 'ZZZZ0001') returning id`);
    await client.query(`insert into public.guild_members (guild_id, user_id, role, joined_at)
      values ($1, $2, 'leader', now() - interval '2 days'), ($1, $3, 'member', now() - interval '1 day')`, [guild.id, guest, member]);

    expect(await purgeAccount(database.withTransaction, guest, CUTOFFS)).toBe(true);

    const { rows } = await client.query('select user_id, role from public.guild_members where guild_id = $1', [guild.id]);
    expect(rows).toEqual([{ user_id: member, role: 'leader' }]);
  });

  it('선정 뒤에 접속한 게스트는 지우지 않는다', async () => {
    const guest = await seedFullAccount(client, { ...STALE_GUEST, nickname: '돌아온게스트' });
    await client.query('update auth.sessions set updated_at = $2 where user_id = $1', [guest, ago(1)]);

    expect(await purgeAccount(database.withTransaction, guest, CUTOFFS)).toBe(false);
    expect(await rowCounts(client, guest)).toEqual(seeded(true));
  });

  it('제재된 게스트와 편지를 보낸 게스트는 지우지 않는다', async () => {
    const restricted = await seedFullAccount(client, { ...STALE_GUEST, save: { gold: 5, updatedAt: OLD, restricted: true }, nickname: '제재' });
    const writer = await seedFullAccount(client, { ...STALE_GUEST, letter: true, nickname: '편지쓴이' });
    expect(await purgeAccount(database.withTransaction, restricted, CUTOFFS)).toBe(false);
    expect(await purgeAccount(database.withTransaction, writer, CUTOFFS)).toBe(false);
    expect(await rowCounts(client, restricted)).toEqual(seeded(true));
    expect(await rowCounts(client, writer)).toEqual(seeded(true, true));
  });
});

describe('정리 기준 시각', () => {
  it('7일 전과 365일 전을 UTC 기준 ISO 시각으로 돌려준다', () => {
    expect(purgeCutoffs(new Date('2030-03-04T05:06:07.000Z'))).toEqual({
      idle: '2030-02-25T05:06:07.000Z', stale: '2029-03-04T05:06:07.000Z',
    });
  });
});
