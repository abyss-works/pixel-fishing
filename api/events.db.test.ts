// 라이브 이벤트 API(GET /api/events)와 /api/action 이벤트 1·2 원자적 실행 통합 테스트.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT_FISH, EVENT2_SETTLEMENT_RATES, EVENT_HAT_IDS } from '../src/game/content/eventFish.js';
import { SNAPSHOT_EVERY } from '../src/game/rules/balance.js';
import type { GameState } from '../src/game/rules/logic.js';
import { createDatabase } from './_db/client.js';
import type { Database } from './_db/client.js';
import { createAdminEvent } from './_data/events.js';
import {
  callAction, captureRealClock, seedUser, seededRandom, sessionHeaders, startActionEnv, testUid, userToken,
} from './_dbTest/actionHarness.js';
import type { ActionEnv, SeedOptions } from './_dbTest/actionHarness.js';
import eventsHandler from './events.js';

const NOW = '2030-03-06T05:30:00.000Z';
let env: ActionEnv;
let database: Database;
let nextUid = 2301;

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
  vi.spyOn(Math, 'random').mockImplementation(seededRandom(123));
  return () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  };
});

const seedMember = (opts: SeedOptions = {}) =>
  seedUser(env.client, { uid: testUid(nextUid++), email: `events-api-${nextUid}@example.test`, ...opts });

const seedGuest = (opts: SeedOptions = {}) =>
  seedUser(env.client, { uid: testUid(nextUid++), email: null, ...opts });

const rewind = (uid: string) =>
  env.client.query(`update public.saves_current set updated_at = '2026-01-01T00:00:00Z', last_catch_at = null where user_id = $1`, [uid]);

async function callEvents(token: string | null, method = 'GET') {
  const out = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
    status(c: number) { out.status = c; return res; },
    json(b: unknown) { out.body = b; },
  };
  await eventsHandler({ method, headers: sessionHeaders(token) } as never, res as never);
  return out;
}

describe('GET /api/events 및 이벤트 1·2 액션', () => {
  it('비로그인 401, 게스트는 활성 목록만 반환하고 진행/순위/당첨 정보는 null로 숨긴다', async () => {
    await createAdminEvent(database.db, {
      id: 'evt-trio-live',
      kind: 'trio',
      title: '삼총사',
      description: '설명',
      startsAt: '2030-03-05T00:00:00.000Z',
      endsAt: '2030-03-10T00:00:00.000Z',
      active: true,
      config: {},
    });
    await createAdminEvent(database.db, {
      id: 'evt-champ-live',
      kind: 'championship',
      title: '강태공 대회',
      description: '설명',
      startsAt: '2030-03-05T00:00:00.000Z',
      endsAt: '2030-03-10T00:00:00.000Z',
      active: true,
      config: {},
    });

    expect(await callEvents(null)).toMatchObject({ status: 401, body: { error: 'unauthorized' } });

    const guestUid = await seedGuest({ state: {} });
    const guestRes = await callEvents(userToken(guestUid));
    expect(guestRes.status).toBe(200);
    expect(guestRes.headers['cache-control']).toBe('private, no-store');
    expect(guestRes.body).toMatchObject({
      now: NOW,
      trio: null,
      championship: null,
      draw: null,
    });
    expect((guestRes.body as { events: { id: string }[] }).events.map(e => e.id)).toEqual(
      expect.arrayContaining(['evt-trio-live', 'evt-champ-live']),
    );
  });

function mockRngSeq(seq: readonly number[], fallback = 0.5): void {
  let idx = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => seq[idx++] ?? fallback);
}

  it('이벤트 1(trio)은 fastCatch와 !fastCatch(스냅샷 경계)에서 일치하는 어종·형태만 기록하고 게스트는 제외한다', async () => {
    const memberFast = await seedMember({ state: { boat: 1, rod: 10 } });
    const memberFull = await seedMember({ state: { boat: 1, rod: 10 }, version: SNAPSHOT_EVERY - 1 });
    const guestUid = await seedGuest({ state: { boat: 1, rod: 10 } });

    await env.client.query(`update public.live_events set active = false where id = 'evt-trio-live'`);
    await createAdminEvent(database.db, {
      id: 'evt-trio-pond',
      kind: 'trio',
      title: '연못 삼총사',
      description: '연못',
      startsAt: '2030-03-05T00:00:00.000Z',
      endsAt: '2030-03-10T00:00:00.000Z',
      active: true,
      config: {
        targets: [
          { fishId: 'crucian', form: 'normal' },
          { fishId: 'minnow', form: 'variant' },
          { fishId: 'loach', form: 'normal' },
        ],
      },
    });

    // 1. fastCatch: 첫 포획이므로 ensureFortune(3회) + rollFish(2회: common, crucian) + rollCatchExtras(size 2회, form 0.5 -> normal)
    mockRngSeq([0.1, 0.1, 0.1, 0.01, 0.01, 0.5, 0.5, 0.5]);
    const cFast = await callAction(userToken(memberFast), { type: 'catch', spot: 'pond', judgment: 'good' });
    expect(cFast.status).toBe(200);
    // 2. !fastCatch (version = SNAPSHOT_EVERY - 1)
    mockRngSeq([0.1, 0.1, 0.1, 0.01, 0.01, 0.5, 0.5, 0.5]);
    const cFull = await callAction(userToken(memberFull), { type: 'catch', spot: 'pond', judgment: 'good' });
    expect(cFull.status).toBe(200);
    // 3. 게스트는 마을에서 낚아도 집계하지 않는다
    mockRngSeq([0.1, 0.1, 0.1, 0.01, 0.01, 0.5, 0.5, 0.5]);
    expect((await callAction(userToken(guestUid), { type: 'catch', spot: 'pond', judgment: 'good' })).status).toBe(200);
    // 4. minnow가 normal 형태로 잡히면 variant 슬롯에 기록되지 않는다 (이미 운세 뽑았으므로 5회 소비)
    await rewind(memberFast);
    mockRngSeq([0.5, 0.4, 0.5, 0.5, 0.99]);
    await callAction(userToken(memberFast), {
      type: 'catch', spot: 'pond', judgment: 'good',
    });

    const trioRows = await env.client.query<{ event_id: string; user_id: string; counts: Record<string, number> }>(
      `select event_id, user_id::text, counts from public.event_trio_progress where event_id = 'evt-trio-pond'`,
    );
    expect(trioRows.rows.map(r => r.user_id).sort()).toEqual([memberFast, memberFull].sort());
    const fastRow = trioRows.rows.find(r => r.user_id === memberFast)!;
    expect(fastRow.counts['crucian:normal']).toBe(1);
    expect(fastRow.counts['minnow:variant']).toBeUndefined();

    const snap = await callEvents(userToken(memberFast));
    expect(snap.status).toBe(200);
    const body = snap.body as {
      trio: {
        eventId: string;
        slots: Array<{ fishId: string; form: string; completed: boolean; completedAt: string | null }>;
        completedAt: string | null;
      } | null;
    };
    expect(body.trio?.eventId).toBe('evt-trio-pond');
    expect(body.trio?.slots[0]).toMatchObject({ fishId: 'crucian', form: 'normal', completed: true });
    expect(body.trio?.slots[0].completedAt).not.toBeNull();
    expect(body.trio?.slots[1]).toMatchObject({ fishId: 'minnow', form: 'variant', completed: false, completedAt: null });
    expect(body.trio?.completedAt).toBeNull();
  });

  it('이벤트 2(championship) 입퇴장·Lv20 페이싱·전용어획·저금통 정산·한정모자 지급·정규표 비오염을 검증한다', async () => {
    const uid = await seedMember({ state: { boat: 3, rod: 50, gold: 100, fame: 10 } });

    // 구역 입장 → championship 이동
    const enterRes = await callAction(userToken(uid), { type: 'enterEventZone', eventId: 'evt-champ-live' });
    expect(enterRes.status).toBe(200);
    expect((enterRes.body as { patch: { scalars: { location: unknown } } }).patch.scalars.location).toEqual({
      kind: 'region', id: 'championship',
    });

    // championship 첫 어획 (수동 good -> perfect 주장해도 Lv20 스펙이라 red=0이므로 good 강등)
    mockRngSeq([0.01, 0.01, 0.5, 0.5, 0.5]); // common 첫 어종(event-boxfish, 10점), normal form
    const catch1 = await callAction(userToken(uid), { type: 'catch', spot: 'championship', judgment: 'perfect' });
    expect(catch1.status).toBe(200);
    const catch1Body = catch1.body as { result: { type: string; fishId: string; info: { form: string } } };
    expect(catch1Body.result.type).toBe('catch');
    expect(catch1Body.result.fishId).toBe(EVENT_FISH[0].id);
    expect(catch1Body.result.info.form).toBe('normal');

    // Lv20 페이싱 검사 — 1초 뒤 바로 재캐치하면 429 too-fast (rod=50이어도 Lv20 기준 2.3s+ 필요)
    vi.setSystemTime(Date.parse(NOW) + 1000);
    const tooFast = await callAction(userToken(uid), { type: 'catch', spot: 'championship', judgment: 'auto' });
    expect(tooFast).toMatchObject({ status: 429, body: { error: 'too-fast' } });

    // 정규 fish_instances, records, saves_current.gold/fame 비오염 확인
    const bagCount = await env.client.query<{ n: number }>('select count(*)::int as n from public.fish_instances where user_id = $1', [uid]);
    const recCount = await env.client.query<{ n: number }>('select count(*)::int as n from public.records where user_id = $1', [uid]);
    const saveRow = await env.client.query<{ gold: string; fame: string; data: GameState }>(
      'select gold, fame, data from public.saves_current where user_id = $1', [uid],
    );
    expect(bagCount.rows[0].n).toBe(0);
    expect(recCount.rows[0].n).toBe(0);
    expect(Number(saveRow.rows[0].gold)).toBe(100);
    expect(Number(saveRow.rows[0].fame)).toBe(10);

    // boat=3 manual 10점당 208G, 4명성 적립 확인
    const expectedGold = Math.floor((EVENT_FISH[0].score * EVENT2_SETTLEMENT_RATES.manual[3]) / 10);
    const expectedFame = Math.floor((EVENT_FISH[0].score * EVENT2_SETTLEMENT_RATES.fame) / 10);

    const beforeSettleMeta = await env.client.query<{ score: number; dex: Record<string, unknown>; updated_at: Date }>(
      `select score, dex, updated_at from public.event_championship_scores where event_id = 'evt-champ-live' and user_id = $1`,
      [uid],
    );

    // 정산 동시성: 두 번 동시에 보내면 한 번만 지급된다 (타이밍에 따라 409 conflict 또는 422 event-nothing-to-settle)
    const settleResults = await Promise.all([
      callAction(userToken(uid), { type: 'settleEventReward' }),
      callAction(userToken(uid), { type: 'settleEventReward' }),
    ]);
    const okSettles = settleResults.filter(r => r.status === 200);
    const failedSettles = settleResults.filter(r => r.status !== 200);
    expect(okSettles).toHaveLength(1);
    expect([409, 422]).toContain(failedSettles[0].status);
    const okSettle = okSettles[0];
    expect((okSettle.body as { result: unknown }).result).toEqual({
      type: 'eventSettle',
      eventId: 'evt-champ-live',
      gold: expectedGold,
      fame: expectedFame,
    });
    const afterSettleSave = await env.client.query<{ gold: string; fame: string }>(
      'select gold, fame from public.saves_current where user_id = $1', [uid],
    );
    expect(Number(afterSettleSave.rows[0].gold)).toBe(100 + expectedGold);
    expect(Number(afterSettleSave.rows[0].fame)).toBe(10 + expectedFame);

    // 정산 뒤 score, dex, updated_at 보존 확인
    const afterSettleMeta = await env.client.query<{ score: number; dex: Record<string, unknown>; updated_at: Date }>(
      `select score, dex, updated_at from public.event_championship_scores where event_id = 'evt-champ-live' and user_id = $1`,
      [uid],
    );
    expect(afterSettleMeta.rows[0].score).toBe(beforeSettleMeta.rows[0].score);
    expect(afterSettleMeta.rows[0].dex).toEqual(beforeSettleMeta.rows[0].dex);
    expect(afterSettleMeta.rows[0].updated_at.toISOString()).toBe(beforeSettleMeta.rows[0].updated_at.toISOString());

    // 다시 정산하면 422 event-nothing-to-settle
    expect(await callAction(userToken(uid), { type: 'settleEventReward' }))
      .toMatchObject({ status: 422, body: { error: 'event-nothing-to-settle' } });

    // 일반 8종 미리 채워 두고 9번째 어종 포획 시 '천지 강태공 삿갓' 원자적 지급
    const preDex = Object.fromEntries(EVENT_FISH.slice(1).map(f => [f.id, { normal: 1, variant: 0 }]));
    await env.client.query(
      `update public.event_championship_scores set dex = $2::jsonb where event_id = 'evt-champ-live' and user_id = $1`,
      [uid, JSON.stringify(preDex)],
    );
    await rewind(uid);
    mockRngSeq([0.01, 0.01, 0.5, 0.5, 0.5]); // event-boxfish normal -> 9/9 완성!
    expect((await callAction(userToken(uid), { type: 'catch', spot: 'championship', judgment: 'auto' })).status).toBe(200);

    const afterHatSave = await env.client.query<{ data: GameState }>(
      'select data from public.saves_current where user_id = $1', [uid],
    );
    const afterHatScore = await env.client.query<{ hats_granted: string[] }>(
      `select hats_granted from public.event_championship_scores where event_id = 'evt-champ-live' and user_id = $1`, [uid],
    );
    expect(afterHatSave.rows[0].data.hats).toContain(EVENT_HAT_IDS.normal);
    expect(afterHatScore.rows[0].hats_granted).toContain(EVENT_HAT_IDS.normal);

    // GET /api/events 스냅샷에서 순위·점수·도감·모자 확인
    const memberSnap = await callEvents(userToken(uid));
    expect(memberSnap.status).toBe(200);
    expect(memberSnap.body).toMatchObject({
      championship: {
        eventId: 'evt-champ-live',
        score: EVENT_FISH[0].score * 2,
        catches: 2,
        rank: 1,
        hatsGranted: [EVENT_HAT_IDS.normal],
      },
    });

    // 구역 퇴장 → boat>=1 이므로 harbor 이동
    const leaveRes = await callAction(userToken(uid), { type: 'leaveEventZone' });
    expect(leaveRes.status).toBe(200);
    expect((leaveRes.body as { patch: { scalars: { location: unknown } } }).patch.scalars.location).toEqual({
      kind: 'base', id: 'harbor',
    });
  });

  it('eventDex는 종료 7일 경과 과거 회차를 포함해 전 회차 도감을 누적 합산하고 최신순 출현 이력(미래 제외)·게스트 빈 counts를 반환한다', async () => {
    await createAdminEvent(database.db, {
      id: 'evt-champ-past-old',
      kind: 'championship',
      title: '지난 겨울 대회',
      description: '종료 7일 경과',
      startsAt: '2030-02-01T00:00:00.000Z',
      endsAt: '2030-02-10T00:00:00.000Z',
      active: false,
      config: {},
    });
    await createAdminEvent(database.db, {
      id: 'evt-champ-future',
      kind: 'championship',
      title: '다가올 대회',
      description: '미래 미시작',
      startsAt: '2030-03-20T00:00:00.000Z',
      endsAt: '2030-03-25T00:00:00.000Z',
      active: true,
      config: {},
    });

    const memberUid = await seedMember({ state: { boat: 1, rod: 20 } });
    const guestUid = await seedGuest({ state: {} });

    await env.client.query(
      `insert into public.event_championship_scores (event_id, user_id, score, catches, dex)
       values
         ('evt-champ-past-old', $1, 100, 3, $2::jsonb),
         ('evt-champ-live', $1, 50, 2, $3::jsonb)`,
      [
        memberUid,
        JSON.stringify({
          'event-boxfish': { normal: 2, variant: 1 },
          'event-glaaki': { normal: 1, variant: 0 },
        }),
        JSON.stringify({
          'event-boxfish': { normal: 1, variant: 2 },
          'event-snow-smelt': { normal: 3, variant: 0 },
        }),
      ],
    );

    const memberSnap = await callEvents(userToken(memberUid));
    expect(memberSnap.status).toBe(200);
    const memberDex = (memberSnap.body as {
      eventDex: {
        counts: Record<string, { normal: number; variant: number }>;
        appearances: Record<string, Array<{ eventId: string; title: string; startsAt: string; endsAt: string }>>;
      };
    }).eventDex;

    expect(memberDex.counts).toEqual({
      'event-boxfish': { normal: 3, variant: 3 },
      'event-glaaki': { normal: 1, variant: 0 },
      'event-snow-smelt': { normal: 3, variant: 0 },
    });

    for (const fish of EVENT_FISH) {
      const list = memberDex.appearances[fish.id];
      expect(list.map(a => a.eventId)).toEqual(['evt-champ-live', 'evt-champ-past-old']);
      expect(list[0]).toEqual({
        eventId: 'evt-champ-live',
        title: '강태공 대회',
        startsAt: '2030-03-05T00:00:00.000Z',
        endsAt: '2030-03-10T00:00:00.000Z',
      });
      expect(list[1]).toEqual({
        eventId: 'evt-champ-past-old',
        title: '지난 겨울 대회',
        startsAt: '2030-02-01T00:00:00.000Z',
        endsAt: '2030-02-10T00:00:00.000Z',
      });
    }

    const guestSnap = await callEvents(userToken(guestUid));
    expect(guestSnap.status).toBe(200);
    const guestDex = (guestSnap.body as {
      eventDex: {
        counts: Record<string, { normal: number; variant: number }>;
        appearances: Record<string, Array<{ eventId: string }>>;
      };
    }).eventDex;
    expect(guestDex.counts).toEqual({});
    expect(guestDex.appearances[EVENT_FISH[0].id].map(a => a.eventId)).toEqual([
      'evt-champ-live',
      'evt-champ-past-old',
    ]);
  });
});
