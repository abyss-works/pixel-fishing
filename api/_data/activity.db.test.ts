// 활동 기록 모듈 — 실제 Postgres에서 세션 기록·이어 붙이기, 활동일, 일별 집계 계산을 검사한다.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import { activeDayUpsert, deleteUserActivity, recordSession, refreshDailyStats } from './activity.js';

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

async function user(opts: { createdAt?: string; anonymous?: boolean } = {}): Promise<string> {
  const uid = randomUUID();
  await client.query(`insert into auth.users (id, email, is_anonymous, created_at) values ($1, $2, $3, $4)`,
    [uid, `${uid}@anonymous.invalid`, opts.anonymous ?? true, opts.createdAt ?? '2030-01-01T00:00:00Z']);
  return uid;
}

const sessionsOf = async (uid: string) => (await client.query(
  `select started_at::text as s, ended_at::text as e, duration_sec as d from public.play_sessions where user_id = $1 order by started_at`,
  [uid])).rows;
const daysOf = async (uid: string) => (await client.query<{ day: string }>(
  'select day::text as day from public.user_active_days where user_id = $1 order by day', [uid])).rows.map(r => r.day);

describe('recordSession', () => {
  it('연결 하나를 세션 하나로 넣고, 2분 안에 다시 시작한 연결은 앞 세션을 늘린다', async () => {
    const uid = await user();
    await recordSession(database.db, uid, '2030-01-01T00:00:00Z', '2030-01-01T00:10:00Z');
    // 1분 59초 뒤 다시 연결 — 이어 붙인다
    await recordSession(database.db, uid, '2030-01-01T00:11:59Z', '2030-01-01T00:20:00Z');
    expect(await sessionsOf(uid)).toEqual([{ s: '2030-01-01 00:00:00+00', e: '2030-01-01 00:20:00+00', d: 1200 }]);
    // 2분을 넘겨 다시 연결 — 새 세션이다
    await recordSession(database.db, uid, '2030-01-01T00:22:01Z', '2030-01-01T00:23:00Z');
    expect(await sessionsOf(uid)).toHaveLength(2);
    expect((await sessionsOf(uid))[1]).toEqual({ s: '2030-01-01 00:22:01+00', e: '2030-01-01 00:23:00+00', d: 59 });
  });

  it('교체된 연결처럼 끝 시각이 앞 세션 안에 있어도 앞 세션을 줄이지 않는다. 다른 사람의 세션과는 잇지 않는다', async () => {
    const [a, b] = [await user(), await user()];
    await recordSession(database.db, a, '2030-01-02T00:00:00Z', '2030-01-02T01:00:00Z');
    await recordSession(database.db, a, '2030-01-02T00:30:00Z', '2030-01-02T00:40:00Z');
    await recordSession(database.db, b, '2030-01-02T01:00:30Z', '2030-01-02T01:05:00Z');
    expect(await sessionsOf(a)).toEqual([{ s: '2030-01-02 00:00:00+00', e: '2030-01-02 01:00:00+00', d: 3600 }]);
    expect(await sessionsOf(b)).toEqual([{ s: '2030-01-02 01:00:30+00', e: '2030-01-02 01:05:00+00', d: 270 }]);
  });
});

describe('activeDayUpsert', () => {
  it('처리 시각의 KST 날짜를 한 번만 남긴다', async () => {
    const uid = await user();
    for (const iso of ['2030-01-01T14:59:59Z', '2030-01-01T15:00:00Z', '2030-01-01T20:00:00Z']) {
      await database.db.execute(activeDayUpsert(uid, iso));
    }
    expect(await daysOf(uid)).toEqual(['2030-01-01', '2030-01-02']);
  });
});

describe('refreshDailyStats', () => {
  const NOW = '2030-02-10T03:00:00Z'; // KST 2030-02-10 12:00
  let a: string;
  let b: string;
  const event = (uid: string, type: string, payload: object, iso: string) => client.query(
    'insert into public.events (user_id, type, payload, created_at) values ($1, $2, $3, $4)', [uid, type, payload, iso]);

  beforeAll(async () => {
    await client.query('truncate public.events, public.play_sessions, public.user_active_days, public.daily_stats');
    // a는 KST 2월 8일에 가입한 게스트, b는 같은 날 가입한 계정이다
    a = await user({ createdAt: '2030-02-08T01:00:00Z' });
    b = await user({ createdAt: '2030-02-07T16:00:00Z', anonymous: false });
    // KST 2월 8일: a의 캐치·판매·미끼, b의 쿠폰, a에 대한 관리자 조치
    await event(a, 'catch', { fishId: 'carp' }, '2030-02-08T02:00:00Z');
    await event(a, 'sell', { gold: 120 }, '2030-02-08T02:01:00Z');
    await event(a, 'buyBait', { cost: 30 }, '2030-02-08T02:02:00Z');
    await event(b, 'coupon', { gold: 500 }, '2030-02-08T14:59:00Z');
    await event(b, 'adminRestrict', { adminId: 'x' }, '2030-02-08T03:00:00Z');
    // KST 2월 9일(어제): b의 우편 수령과 배 구입. 인증 계정이 없는 행은 활동일에서 뺀다
    await event(b, 'claimMail', { mailId: 1, gold: 250 }, '2030-02-08T15:00:00Z');
    await event(b, 'buyBoat', { cost: 1000 }, '2030-02-09T05:00:00Z');
    await event(randomUUID(), 'boot', {}, '2030-02-09T05:00:00Z');
    // 세션: 2월 8일 10분·20분·60분, 2월 9일 없음
    await recordSession(database.db, a, '2030-02-08T01:00:00Z', '2030-02-08T01:10:00Z');
    await recordSession(database.db, b, '2030-02-08T01:00:00Z', '2030-02-08T01:20:00Z');
    await recordSession(database.db, a, '2030-02-08T05:00:00Z', '2030-02-08T06:00:00Z');
  });

  const statsRows = async () => (await client.query(`select day::text as day, dau, new_users, new_accounts, sessions, session_minutes,
      median_session_minutes::text as median, catches, gold_in::int as gold_in, gold_out::int as gold_out, actions
    from public.daily_stats order by day`)).rows;

  it('events가 남아 있는 날만 계산하고, 활동일을 events로 채운다', async () => {
    expect(await refreshDailyStats(database.db, NOW)).toEqual(['2030-02-08', '2030-02-09']);
    expect(await daysOf(a)).toEqual(['2030-02-08']);
    expect(await daysOf(b)).toEqual(['2030-02-08', '2030-02-09']);
    expect(await statsRows()).toEqual([
      { day: '2030-02-08', dau: 2, new_users: 2, new_accounts: 1, sessions: 3, session_minutes: 90, median: '20.0',
        catches: 1, gold_in: 620, gold_out: 30, actions: 4 },
      { day: '2030-02-09', dau: 1, new_users: 0, new_accounts: 0, sessions: 0, session_minutes: 0, median: null,
        catches: 0, gold_in: 250, gold_out: 1000, actions: 3 },
    ]);
  });

  it('이미 있는 지난 날은 두고, 어제와 오늘은 다시 계산한다', async () => {
    await client.query(`update public.daily_stats set dau = 99`);
    await event(a, 'catch', { fishId: 'carp' }, '2030-02-10T01:00:00Z');
    expect(await refreshDailyStats(database.db, NOW)).toEqual(['2030-02-09', '2030-02-10']);
    const rows = await statsRows();
    expect(rows.map(r => [r.day, r.dau])).toEqual([['2030-02-08', 99], ['2030-02-09', 1], ['2030-02-10', 1]]);
  });
});

describe('deleteUserActivity', () => {
  it('그 사용자의 세션과 활동일만 지운다', async () => {
    const [a, b] = [await user(), await user()];
    for (const uid of [a, b]) {
      await recordSession(database.db, uid, '2030-03-01T00:00:00Z', '2030-03-01T00:01:00Z');
      await database.db.execute(activeDayUpsert(uid, '2030-03-01T00:00:00Z'));
    }
    await deleteUserActivity(database.db, a);
    expect([await sessionsOf(a), await daysOf(a)]).toEqual([[], []]);
    expect(await sessionsOf(b)).toHaveLength(1);
    expect(await daysOf(b)).toEqual(['2030-03-01']);
  });
});
