// 기간제 공지 저장소 — 실제 Postgres에서 작성·조회·수정·예약 공지 즉시 마감·삭제·정렬·상한을 검증한다.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { seedUser } from '../_dbTest/actionHarness.js';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import { MAX_NOTICES } from '../../src/game/rules/live.js';
import {
  createNotice,
  deleteNotice,
  endNoticeNow,
  listAllAdminNotices,
  listEndedNotices,
  listLiveNotices,
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

  it('실시간 공지 조회(listLiveNotices)는 예약+활성(starts_at desc, id desc)과 마감(ends_at desc, id desc)을 각각 최대 20건·합계 40건 반환한다', async () => {
    const admin = randomUUID();
    await seedUser(client, { uid: admin, email: `${admin}@example.test`, nickname: null });
    const now = new Date('2030-05-10T12:00:00.000Z');

    // 마감 전 25건(예약 5 + 활성 20) — ends_at > now
    const beforeEndIds: { id: number; startsAt: string }[] = [];
    for (let i = 0; i < 25; i++) {
      const hour = String(i % 24).padStart(2, '0');
      const day = i < 20 ? '09' : '11'; // i>=20은 예약 공지(05-11 이후)
      const startsAt = `2030-05-${day}T${hour}:00:00.000Z`;
      const created = await createNotice(database.db, {
        title: `마감전-${i}`,
        body: `본문-${i}`,
        startsAt,
        endsAt: '2030-05-20T00:00:00.000Z',
        createdBy: admin,
      }, new Date('2030-05-01T00:00:00.000Z'));
      beforeEndIds.push({ id: created.id, startsAt });
    }

    // 마감 25건 — ends_at <= now (ends_at === now 경계 및 동일 ends_at 타이브레이크 포함)
    const endedIds: { id: number; endsAt: string }[] = [];
    for (let i = 0; i < 25; i++) {
      const endsAt = i >= 23
        ? '2030-05-10T12:00:00.000Z' // ends_at === now 경계 2건 (id 내림차순 검증)
        : `2030-05-08T${String(i).padStart(2, '0')}:00:00.000Z`;
      const created = await createNotice(database.db, {
        title: `마감-${i}`,
        body: `종료-${i}`,
        startsAt: '2030-05-01T00:00:00.000Z',
        endsAt,
        createdBy: admin,
      }, new Date('2030-05-01T00:00:00.000Z'));
      endedIds.push({ id: created.id, endsAt });
    }

    const expectedBefore = [...beforeEndIds]
      .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt) || b.id - a.id)
      .slice(0, 20)
      .map(n => n.id);
    const expectedEnded = [...endedIds]
      .sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt) || b.id - a.id)
      .slice(0, 20)
      .map(n => n.id);

    const endedOnly = await listEndedNotices(database.db, now);
    expect(endedOnly).toHaveLength(20);
    expect(endedOnly.map(n => n.id)).toEqual(expectedEnded);

    const live = await listLiveNotices(database.db, now);
    expect(live).toHaveLength(MAX_NOTICES);
    expect(live.slice(0, 20).map(n => n.id)).toEqual(expectedBefore);
    expect(live.slice(20).map(n => n.id)).toEqual(expectedEnded);
    // 예약 공지가 앞쪽(마감전 묶음)에 포함되는지 확인
    expect(live.slice(0, 5).every(n => n.title.startsWith('마감전-2'))).toBe(true);
    // ends_at === now 경계 2건은 마감 묶음 맨 앞(id 내림차순)에 온다
    expect(live[20].id).toBe(endedIds[24].id);
    expect(live[21].id).toBe(endedIds[23].id);
  });
});
