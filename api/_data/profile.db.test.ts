// 프로필 모듈 — 실제 Postgres에서 실시간 채널 표시 이름과 배 읽기를 검사한다.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import { liveIdentity, publicProfile } from './profile.js';

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

async function user(account = false): Promise<string> {
  const uid = randomUUID();
  await client.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, $3)`,
    [uid, account ? `${uid}@example.com` : `${uid}@anonymous.invalid`, !account]);
  return uid;
}

describe('liveIdentity', () => {
  it('프로필 이름과 저장 상태의 배·명성·운영진 여부를 읽는다', async () => {
    const uid = await user();
    await client.query(`insert into public.profiles (user_id, nickname) values ($1, '갈매기')`, [uid]);
    await client.query(`insert into public.saves_current (user_id, data, boat, fame) values ($1, '{}', 3, 420)`, [uid]);
    expect(await liveIdentity(database.db, uid)).toEqual({ nick: '갈매기', boat: 3, fame: 420, staff: false });
  });

  it('프로필과 저장 상태가 없으면 이름은 null, 배·명성은 0, staff는 false다', async () => {
    expect(await liveIdentity(database.db, await user())).toEqual({ nick: null, boat: 0, fame: 0, staff: false });
  });

  it('admin 또는 maintainer 역할이면 show_staff_badge 토글과 무관하게 staff가 true다', async () => {
    const adminUid = await user(true);
    const maintainerUid = await user(true);
    await client.query(`insert into public.admins (user_id, role, show_staff_badge) values ($1, 'admin', false), ($2, 'maintainer', false)`, [adminUid, maintainerUid]);
    expect(await liveIdentity(database.db, adminUid)).toEqual({ nick: null, boat: 0, fame: 0, staff: true });
    expect(await liveIdentity(database.db, maintainerUid)).toEqual({ nick: null, boat: 0, fame: 0, staff: true });
  });
});

describe('publicProfile', () => {
  it('닉네임·배·낚싯대·명성, 일반·돌연변이 어종, 유물·레벨, 모자, 외형, 수령 완료 업적, 위치와 마지막 좌표를 읽는다', async () => {
    const uid = await user(true);
    await client.query(`insert into public.profiles (user_id, nickname) values ($1, '고등어왕')`, [uid]);
    await client.query(`insert into public.saves_current (user_id, data, boat, fame) values ($1, '{}', 2, 12345)`, [uid]);
    await client.query(`update public.saves_current set rod = 9, data = $2::jsonb where user_id = $1`, [uid, JSON.stringify({
      artifacts: ['wreck-compass', 'abyss-angler', 'mami-wata-mirror'],
      artifactLevels: { 'wreck-compass': 3, 'mami-wata-mirror': 2, 'unknown': 4 },
      hats: ['cap-red', 'straw-hat', 'no-such-hat'],
      look: { shirt: 2, pants: 1, hat: 'straw-hat' },
      achievements: { 'variant-village': 'claimed', 'zone-basic-pacific': 'claimed', 'manual-10': 'claimable' },
      location: { kind: 'base', id: 'manila' },
    })]);
    await client.query(`insert into public.records (user_id, fish_id, form, count) values
      ($1, 'crucian', 'normal', 3), ($1, 'crucian', 'variant', 1), ($1, 'carp', 'variant', 2),
      ($1, 'eel', 'normal', 1), ($1, 'perch', 'normal', 0)`, [uid]);
    await client.query(`insert into public.last_positions (user_id, region, x, y) values ($1, 'world', 120, 340)`, [uid]);
    expect(await publicProfile(database.db, uid)).toEqual({
      nickname: '고등어왕', boat: 2, rod: 9, fame: 12345,
      dexFish: ['crucian', 'eel'],
      dexVariant: ['carp', 'crucian'],
      artifacts: ['wreck-compass', 'abyss-angler', 'mami-wata-mirror'],
      artifactLevels: { 'wreck-compass': 3 },
      hats: ['cap-red', 'straw-hat'],
      look: { shirt: 2, pants: 1, hat: 'straw-hat' },
      achievements: ['variant-village'],
      location: { kind: 'base', id: 'manila' },
      lastPos: { region: 'world', x: 120, y: 340 },
      account: true,
    });
  });

  it('프로필과 저장 상태가 없는 게스트는 기본값으로 읽는다', async () => {
    expect(await publicProfile(database.db, await user())).toEqual({
      nickname: null, boat: 0, rod: 1, fame: 0,
      dexFish: [], dexVariant: [], artifacts: [], artifactLevels: {},
      hats: [], look: null, achievements: [], location: null, lastPos: null, account: false,
    });
  });

  it('없는 사용자는 null이다', async () => {
    expect(await publicProfile(database.db, randomUUID())).toBeNull();
  });
});
