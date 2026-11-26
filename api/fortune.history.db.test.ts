// 일일 운세 이력 — 실제 Postgres에서 로그인 계정의 접속·판정 기록, 멱등성, 월별 범위 조회(오름차순),
// 게스트 미기록·403 거부, 비로그인 401 거부, 응답 직후 조회에 오늘 운세가 보이는지를 검증한다.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyFortune } from '../src/game/rules/fortune.js';
import { fortuneScoreOf } from '../src/game/rules/fortune.js';
import type { GameState } from '../src/game/rules/logic.js';
import { ENERGY_ITEM_IDS, ENERGY_PER_INDIVIDUAL } from '../src/game/content/cooking.js';
import { SNAPSHOT_EVERY } from '../src/game/rules/balance.js';
import {
  adminSessionHeaders, callAction, captureRealClock, fish, seedUser, seededRandom, sessionHeaders, startActionEnv, testUid, userToken,
} from './_dbTest/actionHarness.js';
import type { ActionEnv, SeedOptions } from './_dbTest/actionHarness.js';

vi.mock('./observability.js', () => ({ reportServerIssue: vi.fn(async () => undefined) }));

import { reportServerIssue } from './observability.js';
import fortuneHandler from './fortune.js';
import { APP_VERSION } from '../src/version.js';

const NOW = '2030-03-06T05:00:00.000Z'; // KST 2030-03-06 14:00 (수요일)
let env: ActionEnv;
let nextUid = 1601;

beforeAll(async () => {
  env = await startActionEnv();
});
afterAll(async () => {
  await env?.stop();
});
beforeEach(() => {
  vi.mocked(reportServerIssue).mockClear();
  captureRealClock(() => performance.timeOrigin + performance.now());
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
  vi.spyOn(Math, 'random').mockImplementation(seededRandom(77));
  return () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  };
});

async function seed(opts: SeedOptions = {}): Promise<string> {
  const uid = testUid(nextUid++);
  return seedUser(env.client, { uid, email: `fortune-${nextUid}@example.test`, ...opts });
}

async function callHistory(
  token: string | null,
  opts: { method?: string; month?: string } = {},
): Promise<{ status: number; body: unknown }> {
  const out = { status: 0, body: undefined as unknown };
  const res = {
    setHeader() {},
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
  };
  const query = opts.month !== undefined ? { month: opts.month } : {};
  await fortuneHandler({ method: opts.method ?? 'GET', query, headers: { ...sessionHeaders(token) } } as never, res as never);
  return out;
}

/** 응답 시점을 그대로 보는 호출 — 응답 뒤 후속 쓰기가 끝나기를 기다리지 않는다 */
async function callActionBeforeFollowUps(token: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const { default: handler } = await import('./action.js');
  const out = { status: 0, body: undefined as unknown };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    end() {},
  };
  await handler({
    method: 'POST',
    headers: { 'x-build-id': 'dev', 'x-client-version': APP_VERSION, ...sessionHeaders(token) },
    body,
  } as never, res as never);
  return out;
}

const storedFortune = async (uid: string) =>
  (await env.client.query<{ data: GameState }>('select data from public.saves_current where user_id = $1', [uid])).rows[0].data.fortune;

const fortuneRows = async (uid: string): Promise<DailyFortune[]> =>
  (await env.client.query<{ day: string; kind: DailyFortune['kind']; index: number; score: number | null }>(
    'select day, kind, index, score from public.daily_fortunes where user_id = $1 order by day desc', [uid],
  )).rows.map(r => ({
    day: r.day,
    kind: r.kind,
    index: Number(r.index) as 3 | 5,
    ...(r.score !== null ? { score: Number(r.score) } : {}),
  }));

const rewind = (uid: string) =>
  env.client.query(`update public.saves_current set updated_at = '2026-01-01T00:00:00Z', last_catch_at = null where user_id = $1`, [uid]);

describe('일일 운세 이력 기록 및 조회', () => {
  it('로그인 계정이 boot를 호출하면 오늘 운세가 daily_fortunes에 저장되고, 재호출 시 멱등 유지된다', async () => {
    const uid = await seed({ state: {} });
    const first = await callAction(userToken(uid), { type: 'boot', buildId: 'dev' });
    expect(first.status).toBe(200);

    const expected = await storedFortune(uid);
    expect(expected).toMatchObject({ day: '2030-03-06' });
    expect(await fortuneRows(uid)).toEqual([expected!]);

    // 같은 날 다시 boot를 보내도 행은 1건으로 유지되고 값이 바뀌지 않는다
    await rewind(uid);
    const second = await callAction(userToken(uid), { type: 'boot', buildId: 'dev' });
    expect(second.status).toBe(200);
    expect(await fortuneRows(uid)).toEqual([expected!]);
  });

  it('세이브에 당일 운세가 이미 있어도 boot를 호출하면 daily_fortunes 오늘 행을 보장하고 기존 이력을 덮어쓰지 않는다', async () => {
    const uid = await seed({
      state: { fortune: { day: '2030-03-06', kind: 'gold', index: 5 } },
    });
    expect(await fortuneRows(uid)).toEqual([]);

    const goldScore = fortuneScoreOf({ day: '2030-03-06', kind: 'gold', index: 5 });
    expect((await callAction(userToken(uid), { type: 'boot' })).status).toBe(200);
    expect(await fortuneRows(uid)).toEqual([{ day: '2030-03-06', kind: 'gold', index: 5, score: goldScore }]);

    // DB에 이미 다른 값의 행이 먼저 있더라도 on conflict do nothing으로 유지한다
    await env.client.query(`update public.daily_fortunes set kind = 'shadow', index = 3, score = 90 where user_id = $1 and day = '2030-03-06'`, [uid]);
    await rewind(uid);
    expect((await callAction(userToken(uid), { type: 'boot' })).status).toBe(200);
    expect(await fortuneRows(uid)).toEqual([{ day: '2030-03-06', kind: 'shadow', index: 3, score: 90 }]);
  });

  it('catch와 sell에서 새 게임 날짜 운세가 굴려지면 daily_fortunes에 기록된다', async () => {
    const uidFast = await seed({ state: { fortune: { day: '2030-03-05', kind: 'fish', index: 3 } }, version: 2 });
    expect((await callAction(userToken(uidFast), { type: 'catch', spot: 'pond', judgment: 'good' })).status).toBe(200);
    const fFast = await storedFortune(uidFast);
    expect(fFast?.day).toBe('2030-03-06');
    expect(await fortuneRows(uidFast)).toEqual([fFast!]);

    const uidReducer = await seed({
      state: { fortune: { day: '2030-03-05', kind: 'fish', index: 3 } }, version: SNAPSHOT_EVERY - 1,
    });
    expect((await callAction(userToken(uidReducer), { type: 'catch', spot: 'pond', judgment: 'good' })).status).toBe(200);
    const fReducer = await storedFortune(uidReducer);
    expect(fReducer?.day).toBe('2030-03-06');
    expect(await fortuneRows(uidReducer)).toEqual([fReducer!]);

    const crucian = fish('crucian');
    const uidSell = await seed({
      state: { fortune: { day: '2030-03-05', kind: 'fish', index: 3 }, bag: [crucian] },
    });
    expect((await callAction(userToken(uidSell), { type: 'sell', uids: [crucian.uid] })).status).toBe(200);
    const fSell = await storedFortune(uidSell);
    expect(fSell?.day).toBe('2030-03-06');
    expect(await fortuneRows(uidSell)).toEqual([fSell!]);
  });

  it('GET /api/fortune/history는 월별 일일 운세(오름차순), 최초 기록 월, 오늘 운세, 전체 누적 discovered를 돌려준다', async () => {
    const emptyUid = await seed({ state: {} });
    expect(await callHistory(userToken(emptyUid))).toEqual({
      status: 200,
      body: {
        month: '2030-03',
        firstMonth: null,
        currentDay: '2030-03-06',
        today: null,
        days: [],
        discovered: [],
      },
    });

    const uid = await seed({ state: {} });
    const rows: DailyFortune[] = [
      { day: '2030-02-14', kind: 'shadow', index: 3 },
      { day: '2030-02-28', kind: 'gold', index: 5 },
      { day: '2030-03-01', kind: 'fish', index: 3 },
      { day: '2030-03-03', kind: 'shadow', index: 3 },
      { day: '2030-03-04', kind: 'mirage', index: 5 },
    ];
    for (const r of rows) {
      await env.client.query(
        'insert into public.daily_fortunes (user_id, day, kind, index) values ($1, $2, $3, $4)',
        [uid, r.day, r.kind, r.index],
      );
    }

    const expectedDiscovered = [
      { kind: 'shadow', index: 3, count: 2, firstDay: '2030-02-14' },
      { kind: 'gold', index: 5, count: 1, firstDay: '2030-02-28' },
      { kind: 'fish', index: 3, count: 1, firstDay: '2030-03-01' },
      { kind: 'mirage', index: 5, count: 1, firstDay: '2030-03-04' },
    ];

    // month 미지정 시 이번 달(2030-03)과 firstMonth(2030-02) 및 전체 이력 discovered를 돌려주며, 오늘 접속 전이면 today는 null이다
    expect(await callHistory(userToken(uid))).toEqual({
      status: 200,
      body: {
        month: '2030-03',
        firstMonth: '2030-02',
        currentDay: '2030-03-06',
        today: null,
        days: [
          { day: '2030-03-01', kind: 'fish', index: 3, score: fortuneScoreOf({ day: '2030-03-01', kind: 'fish', index: 3 }) },
          { day: '2030-03-03', kind: 'shadow', index: 3, score: fortuneScoreOf({ day: '2030-03-03', kind: 'shadow', index: 3 }) },
          { day: '2030-03-04', kind: 'mirage', index: 5, score: fortuneScoreOf({ day: '2030-03-04', kind: 'mirage', index: 5 }) },
        ],
        discovered: expectedDiscovered,
      },
    });

    // 오늘 boot 후 이전 달(2030-02)을 조회해도 today는 오늘(2030-03-06) 운세를 유지하고 discovered에도 반영된다
    await callAction(userToken(uid), { type: 'boot' });
    const todayFortune = (await storedFortune(uid))!;
    const afterBootRes = await callHistory(userToken(uid), { month: '2030-02' });
    expect(afterBootRes.status).toBe(200);
    expect(afterBootRes.body).toMatchObject({
      month: '2030-02',
      firstMonth: '2030-02',
      currentDay: '2030-03-06',
      today: todayFortune,
      days: [
        { day: '2030-02-14', kind: 'shadow', index: 3, score: fortuneScoreOf({ day: '2030-02-14', kind: 'shadow', index: 3 }) },
        { day: '2030-02-28', kind: 'gold', index: 5, score: fortuneScoreOf({ day: '2030-02-28', kind: 'gold', index: 5 }) },
      ],
    });
    const afterDiscovered = (afterBootRes.body as { discovered: Array<{ kind: string; index: number; count: number; firstDay: string }> }).discovered;
    expect(afterDiscovered.find(d => d.kind === todayFortune.kind && d.index === todayFortune.index)).toBeDefined();

    // 기록이 없는 달 조회 시 days는 빈 배열이지만 firstMonth, today, discovered는 유지된다
    const emptyMonthRes = await callHistory(userToken(uid), { month: '2030-01' });
    expect(emptyMonthRes).toEqual({
      status: 200,
      body: {
        month: '2030-01',
        firstMonth: '2030-02',
        currentDay: '2030-03-06',
        today: todayFortune,
        days: [],
        discovered: afterDiscovered,
      },
    });
  });

  it('12월 연도 경계 조회와 잘못된 month 쿼리 거부를 검증한다', async () => {
    const uid = await seed({ state: {} });
    for (const r of [
      { day: '2030-12-01', kind: 'fish', index: 3 },
      { day: '2030-12-31', kind: 'gold', index: 5 },
      { day: '2031-01-01', kind: 'shadow', index: 3 },
    ] as const) {
      await env.client.query(
        'insert into public.daily_fortunes (user_id, day, kind, index) values ($1, $2, $3, $4)',
        [uid, r.day, r.kind, r.index],
      );
    }

    expect(await callHistory(userToken(uid), { month: '2030-12' })).toEqual({
      status: 200,
      body: {
        month: '2030-12',
        firstMonth: '2030-12',
        currentDay: '2030-03-06',
        today: null,
        days: [
          { day: '2030-12-01', kind: 'fish', index: 3, score: fortuneScoreOf({ day: '2030-12-01', kind: 'fish', index: 3 }) },
          { day: '2030-12-31', kind: 'gold', index: 5, score: fortuneScoreOf({ day: '2030-12-31', kind: 'gold', index: 5 }) },
        ],
        discovered: [
          { kind: 'fish', index: 3, count: 1, firstDay: '2030-12-01' },
          { kind: 'gold', index: 5, count: 1, firstDay: '2030-12-31' },
          { kind: 'shadow', index: 3, count: 1, firstDay: '2031-01-01' },
        ],
      },
    });

    for (const bad of ['', '2030-00', '2030-13', 'invalid']) {
      expect(await callHistory(userToken(uid), { month: bad })).toEqual({
        status: 400,
        body: { error: 'bad-month' },
      });
    }

    const maxUid = await seed({ state: {} });
    for (const r of [
      { day: '9999-11-30', kind: 'shadow', index: 3 },
      { day: '9999-12-01', kind: 'fish', index: 3 },
      { day: '9999-12-31', kind: 'gold', index: 5 },
    ] as const) {
      await env.client.query(
        'insert into public.daily_fortunes (user_id, day, kind, index) values ($1, $2, $3, $4)',
        [maxUid, r.day, r.kind, r.index],
      );
    }
    expect(await callHistory(userToken(maxUid), { month: '9999-12' })).toEqual({
      status: 200,
      body: {
        month: '9999-12',
        firstMonth: '9999-11',
        currentDay: '2030-03-06',
        today: null,
        days: [
          { day: '9999-12-01', kind: 'fish', index: 3, score: fortuneScoreOf({ day: '9999-12-01', kind: 'fish', index: 3 }) },
          { day: '9999-12-31', kind: 'gold', index: 5, score: fortuneScoreOf({ day: '9999-12-31', kind: 'gold', index: 5 }) },
        ],
        discovered: [
          { kind: 'shadow', index: 3, count: 1, firstDay: '9999-11-30' },
          { kind: 'fish', index: 3, count: 1, firstDay: '9999-12-01' },
          { kind: 'gold', index: 5, count: 1, firstDay: '9999-12-31' },
        ],
      },
    });
  });

  it('KST 04:00 게임 날짜 경계에 맞춰 currentDay와 월별 기본 조회를 계산한다', async () => {
    const uid = await seed({ state: {} });
    // KST 2030-03-05 03:59:59 → 게임 날짜 2030-03-04
    vi.setSystemTime(new Date('2030-03-04T18:59:59.000Z'));
    await callAction(userToken(uid), { type: 'boot' });
    const day4 = await callHistory(userToken(uid));
    expect(day4.status).toBe(200);
    expect((day4.body as { month: string; currentDay: string; today: DailyFortune | null })).toMatchObject({
      month: '2030-03',
      currentDay: '2030-03-04',
      today: { day: '2030-03-04' },
    });

    // KST 2030-03-05 04:00:00 → 게임 날짜 2030-03-05
    await rewind(uid);
    vi.setSystemTime(new Date('2030-03-04T19:00:00.000Z'));
    await callAction(userToken(uid), { type: 'boot' });
    const day5 = await callHistory(userToken(uid));
    expect(day5.status).toBe(200);
    expect((day5.body as { currentDay: string; days: DailyFortune[] }).currentDay).toBe('2030-03-05');
    expect((day5.body as { days: DailyFortune[] }).days.map(h => h.day)).toEqual(['2030-03-04', '2030-03-05']);
  });

  it('게스트는 boot·catch·sell을 실행해도 daily_fortunes에 기록되지 않고 조회는 403 account-only로 거부된다', async () => {
    const f = fish('crucian');
    const uid = await seed({ email: null, state: { bag: [f] } });

    expect((await callAction(userToken(uid), { type: 'boot' })).status).toBe(200);
    await rewind(uid);
    expect((await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'good' })).status).toBe(200);
    await rewind(uid);
    expect((await callAction(userToken(uid), { type: 'sell', uids: [f.uid] })).status).toBe(200);

    expect(await storedFortune(uid)).toMatchObject({ day: '2030-03-06' });
    expect(await fortuneRows(uid)).toEqual([]);

    const res = await callHistory(userToken(uid));
    expect(res).toEqual({ status: 403, body: { error: 'account-only' } });
  });

  it('비로그인 요청은 401 unauthorized를 반환한다', async () => {
    expect(await callHistory(null)).toEqual({ status: 401, body: { error: 'unauthorized' } });
  });

  it('boot 응답 직후 후속 쓰기를 기다리지 않아도 운세 조회에 오늘 운세가 보인다', async () => {
    const uid = await seed({ state: {} });
    const res = await callActionBeforeFollowUps(userToken(uid), { type: 'boot' });
    expect(res.status).toBe(200);
    const today = (await storedFortune(uid))!;
    expect(today).toMatchObject({ day: '2030-03-06' });
    expect(await callHistory(userToken(uid))).toMatchObject({ status: 200, body: { currentDay: '2030-03-06', today } });
    expect(reportServerIssue).not.toHaveBeenCalled();
  });

  it('게임 날짜가 바뀐 뒤 첫 catch 응답 직후에도 운세 조회에 새 날짜 운세가 보인다', async () => {
    const uid = await seed({ state: { fortune: { day: '2030-03-05', kind: 'fish', index: 3 } }, version: 2 });
    const res = await callActionBeforeFollowUps(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'good' });
    expect(res.status).toBe(200);
    const today = (await storedFortune(uid))!;
    expect(today.day).toBe('2030-03-06');
    expect(await fortuneRows(uid)).toEqual([today]);
    expect(await callHistory(userToken(uid))).toMatchObject({ status: 200, body: { today } });
  });

  it('extractEnergy에서 당일 운세가 없으면 ensureFortune으로 먼저 확정하고 기운 배수 및 daily_fortunes를 즉시 반영한다', async () => {
    // seededRandom이 energy(tier 2, kind index 3, strength index 5 -> ×2.00)를 뽑도록 결정적 난수 시퀀스 제공
    vi.spyOn(Math, 'random').mockReset();
    const seq = [0.7, 0.9, 0.5];
    let i = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => seq[i++] ?? 0.5);

    const f = fish('crucian');
    const uid = await seed({
      state: {
        boat: 5,
        location: { kind: 'base', id: 'home' },
        bag: [f],
        fortune: { day: '2030-03-05', kind: 'fish', index: 3 },
      },
    });
    const res = await callAction(userToken(uid), { type: 'extractEnergy', uids: [f.uid] });
    expect(res.status).toBe(200);
    expect((res.body as { result: { type: string; energy: Record<string, number> } }).result).toEqual({
      type: 'extract',
      energy: { common: ENERGY_PER_INDIVIDUAL * 2, rare: 0, epic: 0, legendary: 0 },
    });
    const expectedEnergyScore = fortuneScoreOf({ day: '2030-03-06', kind: 'energy', index: 5 });
    expect(await storedFortune(uid)).toEqual({ day: '2030-03-06', kind: 'energy', index: 5, score: expectedEnergyScore });
    expect(await fortuneRows(uid)).toEqual([{ day: '2030-03-06', kind: 'energy', index: 5, score: expectedEnergyScore }]);

    const { rows } = await env.client.query<{ data: GameState }>('select data from public.saves_current where user_id = $1', [uid]);
    expect(rows[0].data.items[ENERGY_ITEM_IDS.common]).toBe(ENERGY_PER_INDIVIDUAL * 2);
  });

  it('fortune.set은 preview/local에서 오늘 세이브와 로그인 계정 daily_fortunes를 덮어쓰고, production·비관리자·3등급 3 강도는 거부한다', async () => {
    const adminUid = await seedUser(env.client, { uid: testUid(nextUid++), email: 'fortune-admin@example.test', admin: true, state: {} });
    const memberUid = await seed({ state: {} });
    const guestUid = await seedUser(env.client, { uid: testUid(nextUid++), state: {} });

    // boot로 기존 daily_fortunes(2030-03-06) 행을 만든 뒤 fortune.set으로 교체(upsert)
    expect((await callAction(userToken(memberUid), { type: 'boot' })).status).toBe(200);

    process.env.DEPLOY_ENV = 'preview';
    const adminHeaders = adminSessionHeaders(userToken(adminUid));

    // 비관리자는 preview에서 차단
    expect(await callAction(userToken(memberUid), {
      type: 'debug', command: 'fortune.set', args: { kind: 'golden-scale' },
    })).toMatchObject({ status: 422, body: { error: 'debug-forbidden' } });

    // 3등급 index: 3 거부
    expect(await callAction(userToken(memberUid), {
      type: 'debug', command: 'fortune.set', args: { kind: 'golden-scale', index: 3 },
    }, { headers: adminHeaders })).toMatchObject({ status: 422, body: { error: 'bad-request' } });

    // 3등급 index 생략 → index: 5로 세이브 + daily_fortunes upsert
    const grandCatchScore = fortuneScoreOf({ day: '2030-03-06', kind: 'grand-catch', index: 5 });
    const tier3Res = await callAction(userToken(memberUid), {
      type: 'debug', command: 'fortune.set', args: { kind: 'grand-catch' },
    }, { headers: adminHeaders });
    expect(tier3Res.status).toBe(200);
    expect((tier3Res.body as { patch: { scalars: { fortune: DailyFortune } } }).patch.scalars.fortune).toEqual({
      day: '2030-03-06', kind: 'grand-catch', index: 5, score: grandCatchScore,
    });
    expect(await storedFortune(memberUid)).toEqual({ day: '2030-03-06', kind: 'grand-catch', index: 5, score: grandCatchScore });
    expect(await fortuneRows(memberUid)).toEqual([{ day: '2030-03-06', kind: 'grand-catch', index: 5, score: grandCatchScore }]);

    // 다시 다른 운세로 교체해도 daily_fortunes 행은 1건으로 덮어써진다 (score 명시 지정 포함)
    expect((await callAction(userToken(memberUid), {
      type: 'debug', command: 'fortune.set', args: { kind: 'energy', index: 3, score: 92 },
    }, { headers: adminHeaders })).status).toBe(200);
    expect(await fortuneRows(memberUid)).toEqual([{ day: '2030-03-06', kind: 'energy', index: 3, score: 92 }]);

    // 구간 밖 score는 거부한다
    expect(await callAction(userToken(memberUid), {
      type: 'debug', command: 'fortune.set', args: { kind: 'energy', index: 3, score: 85 },
    }, { headers: adminHeaders })).toMatchObject({ status: 422, body: { error: 'bad-request' } });

    // 관리자 쿠키를 동반한 게스트는 세이브만 바꾸고 daily_fortunes는 저장하지 않는다
    const mirageScore = fortuneScoreOf({ day: '2030-03-06', kind: 'mirage', index: 5 });
    expect((await callAction(userToken(guestUid), {
      type: 'debug', command: 'fortune.set', args: { kind: 'mirage' },
    }, { headers: adminHeaders })).status).toBe(200);
    expect(await storedFortune(guestUid)).toEqual({ day: '2030-03-06', kind: 'mirage', index: 5, score: mirageScore });
    expect(await fortuneRows(guestUid)).toEqual([]);

    // production에서는 관리자여도 차단
    process.env.DEPLOY_ENV = 'production';
    expect(await callAction(userToken(adminUid), {
      type: 'debug', command: 'fortune.set', args: { kind: 'fish', index: 5 },
    }, { headers: adminHeaders })).toMatchObject({ status: 422, body: { error: 'debug-forbidden' } });
    process.env.DEPLOY_ENV = 'local';
  });
});
