// 기간제 공지 저장소 — 실제 Postgres에서 작성·조회·수정·예약 공지 즉시 마감·삭제·정렬·상한을 검증한다.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { seedUser } from '../_dbTest/actionHarness.js';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import {
  createNotice,
  deleteNotice,
  endNoticeNow,
  listAllAdminNotices,
  listUpcomingAndActiveNotices,
  updateNotice,
} from './notices.js';

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
beforeEach(async () => {
  await client.query('delete from public.notices');
});

describe('notices', () => {
  it('활성·예정 공지 조회는 종료 전 공지만 시작일 내림차순·상한으로 돌려준다', async () => {
    const admin = randomUUID();
    await seedUser(client, { uid: admin, email: `${admin}@example.test`, nickname: null });
    const now = new Date('2030-05-10T12:00:00.000Z');

    await createNotice(database.db, {
      title: '마감된 공지',
      body: '종료됨',
      startsAt: '2030-05-01T00:00:00.000Z',
      endsAt: '2030-05-10T12:00:00.000Z', // ends_at === now 제외
      createdBy: admin,
    }, new Date('2030-05-01T00:00:00.000Z'));

    const active = await createNotice(database.db, {
      title: '진행 중 공지',
      body: '활성 본문',
      startsAt: '2030-05-10T00:00:00.000Z',
      endsAt: '2030-05-11T00:00:00.000Z',
      createdBy: admin,
    }, new Date('2030-05-09T00:00:00.000Z'));

    const upcoming = await createNotice(database.db, {
      title: '예약 공지',
      body: '예정 본문',
      startsAt: '2030-05-12T00:00:00.000Z',
      endsAt: '2030-05-13T00:00:00.000Z',
      createdBy: admin,
    }, new Date('2030-05-09T01:00:00.000Z'));

    expect(await listUpcomingAndActiveNotices(database.db, now)).toEqual([
      {
        id: upcoming.id,
        title: '예약 공지',
        body: '예정 본문',
        startsAt: '2030-05-12T00:00:00.000Z',
        endsAt: '2030-05-13T00:00:00.000Z',
        createdAt: '2030-05-09T01:00:00.000Z',
      },
      {
        id: active.id,
        title: '진행 중 공지',
        body: '활성 본문',
        startsAt: '2030-05-10T00:00:00.000Z',
        endsAt: '2030-05-11T00:00:00.000Z',
        createdAt: '2030-05-09T00:00:00.000Z',
      },
    ]);

    expect((await listUpcomingAndActiveNotices(database.db, now, 1)).map(n => n.title)).toEqual(['예약 공지']);
    expect((await listAllAdminNotices(database.db)).map(n => n.title)).toEqual([
      '예약 공지',
      '진행 중 공지',
      '마감된 공지',
    ]);
  });

  it('수정·예약 공지 즉시 마감(ends_at > starts_at 제약 준수)·삭제를 처리한다', async () => {
    const admin = randomUUID();
    await seedUser(client, { uid: admin, email: `${admin}@example.test`, nickname: null });

    const created = await createNotice(database.db, {
      title: '예정 공지',
      body: '원래 본문',
      startsAt: '2030-06-01T00:00:00.000Z',
      endsAt: '2030-06-02T00:00:00.000Z',
      createdBy: admin,
    }, new Date('2030-05-01T00:00:00.000Z'));

    const updated = await updateNotice(database.db, created.id, {
      title: '수정된 예정 공지',
      body: '바뀐 본문',
      startsAt: '2030-06-05T00:00:00.000Z',
      endsAt: '2030-06-06T00:00:00.000Z',
    }, new Date('2030-05-02T00:00:00.000Z'));
    expect(updated).toMatchObject({
      id: created.id,
      title: '수정된 예정 공지',
      body: '바뀐 본문',
      startsAt: '2030-06-05T00:00:00.000Z',
      endsAt: '2030-06-06T00:00:00.000Z',
      updatedAt: '2030-05-02T00:00:00.000Z',
    });

    // 아직 시작 전인 예약 공지를 즉시 마감해도 ends_at > starts_at 제약 위반 없이 마감된다
    const endAt = new Date('2030-05-03T12:00:00.000Z');
    const ended = await endNoticeNow(database.db, created.id, endAt);
    expect(ended).toMatchObject({
      id: created.id,
      startsAt: '2030-05-03T11:59:59.999Z',
      endsAt: '2030-05-03T12:00:00.000Z',
      updatedAt: '2030-05-03T12:00:00.000Z',
    });
    expect(await listUpcomingAndActiveNotices(database.db, endAt)).toEqual([]);

    expect(await updateNotice(database.db, 999_999, {
      title: '없음',
      body: '없음',
      startsAt: '2030-06-01T00:00:00.000Z',
      endsAt: '2030-06-02T00:00:00.000Z',
    })).toBeNull();
    expect(await endNoticeNow(database.db, 999_999)).toBeNull();

    expect(await deleteNotice(database.db, created.id)).toBe(true);
    expect(await deleteNotice(database.db, created.id)).toBe(false);
    expect(await listAllAdminNotices(database.db)).toEqual([]);
  });
});
