// 약관 수락 기록 저장 모듈을 실제 Postgres에서 검사한다. 두 문서의 원자적 기록, 중복 무시, 판별 조회, 삭제를 고정한다.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import { deleteUserConsents, hasAcceptedVersion, recordConsent } from './consent.js';

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
  await client.query('insert into auth.users (id, email, is_anonymous) values ($1, $2, false)', [uid, `${uid}@example.test`]);
  return uid;
}
const rows = async (uid: string) => (await client.query<{ document: string; version: string; age_confirmed: boolean; channel: string; accepted_at: Date }>(
  'select document, version, age_confirmed, channel, accepted_at from public.consent_records where user_id = $1 order by version, document', [uid])).rows;

describe('recordConsent', () => {
  it('한 번의 수락이 약관과 처리방침 두 행을 현재 시각(UTC)으로 남긴다', async () => {
    const uid = await user();
    const before = Date.now();
    await recordConsent(database.db, uid, '2030-01-01', 'confirm-screen');
    const got = await rows(uid);
    expect(got.map(r => [r.document, r.version, r.age_confirmed, r.channel])).toEqual([
      ['privacy', '2030-01-01', true, 'confirm-screen'],
      ['terms', '2030-01-01', true, 'confirm-screen'],
    ]);
    for (const r of got) {
      expect(r.accepted_at.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(r.accepted_at.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    }
  });

  it('같은 판을 다시 기록해도 행이 늘지 않고 처음 기록을 바꾸지 않는다', async () => {
    const uid = await user();
    await recordConsent(database.db, uid, '2030-01-01', 'google-link');
    const first = await rows(uid);
    await recordConsent(database.db, uid, '2030-01-01', 'confirm-screen');
    expect(await rows(uid)).toEqual(first);
  });

  it('다른 판은 별도 행으로 쌓인다', async () => {
    const uid = await user();
    await recordConsent(database.db, uid, '2030-01-01', 'google-link');
    await recordConsent(database.db, uid, '2030-06-01', 'confirm-screen');
    expect((await rows(uid)).map(r => `${r.version}/${r.document}`)).toEqual([
      '2030-01-01/privacy', '2030-01-01/terms', '2030-06-01/privacy', '2030-06-01/terms',
    ]);
  });

  it('기록이 실패하면 어느 문서도 남지 않는다', async () => {
    const uid = await user();
    await expect(recordConsent(database.db, uid, 'not-a-date', 'google-link')).rejects.toThrow();
    expect(await rows(uid)).toEqual([]);
  });

  it('없는 계정은 기록하지 않고 실패한다', async () => {
    await expect(recordConsent(database.db, randomUUID(), '2030-01-01', 'google-link')).rejects.toThrow();
  });
});

describe('hasAcceptedVersion', () => {
  it('두 문서가 모두 있는 판만 수락한 것으로 본다', async () => {
    const uid = await user();
    expect(await hasAcceptedVersion(database.db, uid, '2030-01-01')).toBe(false);
    await client.query(`insert into public.consent_records (user_id, document, version, age_confirmed, channel) values ($1, 'terms', '2030-01-01', true, 'google-link')`, [uid]);
    expect(await hasAcceptedVersion(database.db, uid, '2030-01-01')).toBe(false);
    await recordConsent(database.db, uid, '2030-01-01', 'google-link');
    expect(await hasAcceptedVersion(database.db, uid, '2030-01-01')).toBe(true);
  });

  it('이전 판만 수락한 계정은 현재 판을 수락하지 않은 것이다', async () => {
    const uid = await user();
    await recordConsent(database.db, uid, '2030-01-01', 'google-link');
    expect(await hasAcceptedVersion(database.db, uid, '2030-06-01')).toBe(false);
    expect(await hasAcceptedVersion(database.db, uid, '2030-01-01')).toBe(true);
  });

  it('다른 계정의 기록은 세지 않는다', async () => {
    const a = await user();
    const b = await user();
    await recordConsent(database.db, a, '2030-01-01', 'google-link');
    expect(await hasAcceptedVersion(database.db, b, '2030-01-01')).toBe(false);
  });
});

describe('삭제', () => {
  it('deleteUserConsents는 그 계정의 기록만 지운다', async () => {
    const a = await user();
    const b = await user();
    await recordConsent(database.db, a, '2030-01-01', 'google-link');
    await recordConsent(database.db, b, '2030-01-01', 'google-link');
    await deleteUserConsents(database.db, a);
    expect(await rows(a)).toEqual([]);
    expect(await rows(b)).toHaveLength(2);
  });

  it('인증 계정을 지우면 연쇄 삭제로 함께 지워진다', async () => {
    const uid = await user();
    await recordConsent(database.db, uid, '2030-01-01', 'google-link');
    await client.query('delete from auth.users where id = $1', [uid]);
    expect(await rows(uid)).toEqual([]);
  });
});
