// 라이브 이벤트 저장 모듈(live_events·event_trio_progress·event_championship_scores·event_draws) DB 테스트.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT_FISH, EVENT_HAT_IDS } from '../../src/game/content/eventFish.js';
import { fortuneScoreOf } from '../../src/game/rules/fortune.js';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { captureRealClock, seedUser, startActionEnv, testUid } from '../_dbTest/actionHarness.js';
import type { ActionEnv } from '../_dbTest/actionHarness.js';
import { COMMIT_GUARD, commitAction } from './commit.js';
import { versionUpdate } from './save.js';
import { newState } from '../../src/game/rules/logic.js';
import {
  createAdminEvent,
  deleteAdminEvent,
  deleteUserEventRows,
  drawEventWinners,
  endAdminEventNow,
  listAdminEvents,
  listEventDraws,
  loadEventsSnapshot,
  settleChampionshipFragment,
  updateAdminEvent,
  upsertChampionshipCatchFragment,
  upsertTrioProgressFragment,
} from './events.js';

const NOW = '2030-03-06T05:00:00.000Z'; // KST 2030-03-06 14:00
let env: ActionEnv;
let database: Database;
let nextUid = 2201;

beforeAll(async () => {
  env = await startActionEnv();
  database = createDatabase({ connectionString: env.db.url, max: 4 });
});
afterAll(async () => {
  await database?.pool.end();
  await env?.stop();
});
beforeEach(() => {
  captureRealClock(() => performance.timeOrigin + performance.now());
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
  return () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  };
});

const seedMember = (nickname: string, look = { shirt: 1, pants: 2, hat: null as string | null }) =>
  seedUser(env.client, {
    uid: testUid(nextUid++),
    email: `events-data-${nextUid}@example.test`,
    nickname,
    state: { look },
  });

describe('live_events CRUD 및 진행·순위·추첨', () => {
  it('이벤트 생성·수정·조기종료·삭제와 트리오 진행·추첨·우편 발송·계정 삭제를 수행한다', async () => {
    const u1 = await seedMember('트리오일등');
    const u2 = await seedMember('트리오이등');

    const created = await createAdminEvent(database.db, {
      id: 'trio-s1',
      kind: 'trio',
      title: '삼총사를 낚아라',
      description: '세 마리 낚기',
      startsAt: '2030-03-05T00:00:00.000Z',
      endsAt: '2030-03-10T00:00:00.000Z',
      active: true,
      config: {},
    });
    expect(created).not.toBe('duplicate');

    const updated = await updateAdminEvent(database.db, {
      id: 'trio-s1',
      title: '삼총사를 낚아라 시즌1',
      description: '설명 수정',
      startsAt: '2030-03-05T00:00:00.000Z',
      endsAt: '2030-03-11T00:00:00.000Z',
      active: true,
      config: {},
    });
    expect(updated?.title).toBe('삼총사를 낚아라 시즌1');

    // u1이 3종 모두 포획
    const targets = [
      { fishId: 'mackerel', form: 'normal' as const },
      { fishId: 'squid', form: 'normal' as const },
      { fishId: 'sailfish', form: 'normal' as const },
    ];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const v = i + 2;
      const committed = await commitAction(
        database.db,
        versionUpdate(u1, { ...newState(), version: v } as never, v, NOW),
        [upsertTrioProgressFragment(COMMIT_GUARD, u1, 'trio-s1', targets, t.fishId, t.form, NOW)],
      );
      expect(committed).toBe(true);
    }
    // u2는 1종만 포획 (추첨 대상 제외)
    await commitAction(
      database.db,
      versionUpdate(u2, newState(), 2, NOW),
      [upsertTrioProgressFragment(COMMIT_GUARD, u2, 'trio-s1', targets, 'mackerel', 'normal', NOW)],
    );

    const ended = await endAdminEventNow(database.db, 'trio-s1', new Date(NOW));
    expect(ended?.endsAt).toBe(NOW);

    const drawRes = await drawEventWinners(database.withTransaction, {
      eventId: 'trio-s1',
      count: 1,
      rewardKind: 'none',
      rewardId: null,
      rewardQty: 0,
      gold: 0,
      rewardPins: ['PIN-TRIO-7777'],
      rewardExpiresAt: '2030-12-31',
      seed: 'seed-1',
    }, NOW);
    expect(drawRes).not.toBe('no-event');
    if (drawRes !== 'no-event') {
      expect(drawRes.eligibleCount).toBe(1);
      expect(drawRes.draws).toHaveLength(1);
      expect(drawRes.draws[0]).toMatchObject({
        eventId: 'trio-s1',
        userId: u1,
        rewardPin: 'PIN-TRIO-7777',
        rewardExpiresAt: '2030-12-31',
      });
      expect(drawRes.draws[0].mailId).toBeGreaterThan(0);
    }

    // 당첨자에게만 PIN이 노출되고 비당첨자에게는 노출되지 않는다
    const winnerSnap = await loadEventsSnapshot(database.db, u1, false, NOW);
    expect(winnerSnap.trio).toMatchObject({
      eventId: 'trio-s1',
      won: true,
      rewardPin: 'PIN-TRIO-7777',
      rewardExpiresAt: '2030-12-31',
    });
    expect(winnerSnap.trio?.slots.every(s => s.completed)).toBe(true);

    const nonWinnerSnap = await loadEventsSnapshot(database.db, u2, false, NOW);
    expect(nonWinnerSnap.trio).toMatchObject({
      eventId: 'trio-s1',
      won: false,
      rewardPin: null,
      rewardExpiresAt: null,
    });

    const drawsList = await listEventDraws(database.db, 'trio-s1');
    expect(drawsList).toHaveLength(1);

    await deleteUserEventRows(database.db, u1);
    expect(await listEventDraws(database.db, 'trio-s1')).toHaveLength(0);

    const list = await listAdminEvents(database.db);
    expect(list.some(e => e.id === 'trio-s1')).toBe(true);
    expect(await deleteAdminEvent(database.db, 'trio-s1')).toBe(true);
    expect(await deleteAdminEvent(database.db, 'trio-s1')).toBe(false);
  });

  it('챔피언십 순위(동점 선도달 우선)·look·정산 불변성과 행운왕 동점(총점→출석일→도달시각)을 검증한다', async () => {
    const lookA = { shirt: 3, pants: 4, hat: 'cap-red' };
    const lookB = { shirt: 5, pants: 6, hat: null };
    const a = await seedMember('선수A', lookA);
    const b = await seedMember('선수B', lookB);

    await createAdminEvent(database.db, {
      id: 'champ-1',
      kind: 'championship',
      title: '강태공 선수권',
      description: '대회',
      startsAt: '2030-03-05T00:00:00.000Z',
      endsAt: '2030-03-10T00:00:00.000Z',
      active: true,
      config: {},
    });
    await createAdminEvent(database.db, {
      id: 'luck-1',
      kind: 'draw',
      title: '천하제일 행운왕',
      description: '운세왕',
      startsAt: '2030-03-04T19:00:00.000Z', // KST 2030-03-05 04:00 (gameDay 2030-03-05)
      endsAt: '2030-03-06T19:00:00.000Z',   // KST 2030-03-07 04:00 (gameDay 2030-03-05..06)
      active: true,
      config: {},
    });

    const t1 = '2030-03-06T01:00:00.000Z';
    const t2 = '2030-03-06T02:00:00.000Z';
    const t3 = '2030-03-06T03:00:00.000Z';
    await commitAction(database.db, versionUpdate(b, { ...newState(), look: lookB }, 2, t1), [
      upsertChampionshipCatchFragment(COMMIT_GUARD, b, 'champ-1', {
        fishId: EVENT_FISH[0].id, form: 'normal', score: 100, pendingGold: 90, pendingFame: 40, hatsToGrant: [],
      }, t1),
    ]);
    await commitAction(database.db, versionUpdate(a, { ...newState(), look: lookA }, 2, t2), [
      upsertChampionshipCatchFragment(COMMIT_GUARD, a, 'champ-1', {
        fishId: EVENT_FISH[0].id, form: 'normal', score: 100, pendingGold: 90, pendingFame: 40, hatsToGrant: [EVENT_HAT_IDS.normal],
      }, t2),
    ]);
    // b가 정산해도 updated_at(도달 시각)과 score가 보존되므로 동점 시 b가 1위를 유지한다
    await commitAction(database.db, versionUpdate(b, { ...newState(), look: lookB, gold: 90, fame: 40 }, 3, t3), [
      settleChampionshipFragment(COMMIT_GUARD, b, 'champ-1', t3),
    ]);

    // 행운왕: a는 2일 출석(81+90=171), b는 2일 출석(81+90=171, b가 더 이른 created_at), legacy null score 테스트 포함
    await env.client.query(
      `insert into public.daily_fortunes (user_id, day, kind, index, score, created_at) values
       ($1, '2030-03-05', 'fish', 3, 81, '2030-03-05T05:00:00Z'),
       ($1, '2030-03-06', 'shadow', 3, 90, '2030-03-06T06:00:00Z'),
       ($2, '2030-03-05', 'fish', 3, null, '2030-03-05T05:00:00Z'),
       ($2, '2030-03-06', 'energy', 5, 95, '2030-03-06T05:00:00Z')`,
      [a, b],
    );

    const snapA = await loadEventsSnapshot(database.db, a, false, NOW);
    expect(snapA.championship).toMatchObject({
      eventId: 'champ-1',
      score: 100,
      pendingGold: 90,
      pendingFame: 40,
      hatsGranted: [EVENT_HAT_IDS.normal],
      rank: 2,
    });
    expect(snapA.championship?.top.map(r => ({ nickname: r.nickname, rank: r.rank, look: r.look }))).toEqual([
      { nickname: '선수B', rank: 1, look: { shirt: 5, pants: 6, hat: null } },
      { nickname: '선수A', rank: 2, look: { shirt: 3, pants: 4, hat: 'cap-red' } },
    ]);

    const legacyScoreB = fortuneScoreOf({ day: '2030-03-05', kind: 'fish', index: 3 });
    const snapB = await loadEventsSnapshot(database.db, b, false, NOW);
    expect(snapB.draw).toMatchObject({
      eventId: 'luck-1',
      totalScore: legacyScoreB + 95,
      attendedDays: 2,
      won: false,
    });
    expect(snapB.draw?.days).toEqual([
      { day: '2030-03-05', kind: 'fish', index: 3, score: legacyScoreB },
      { day: '2030-03-06', kind: 'energy', index: 5, score: 95 },
    ]);
    expect(snapB.draw?.top[0]).toMatchObject({ userId: b, rank: 1, score: legacyScoreB + 95 });
    expect(snapB.draw?.rank).toBe(1);
  });
});
