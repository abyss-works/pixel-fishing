// 일일 운세 이력 — 실제 Postgres에서 로그인 계정의 접속·판정 기록, 멱등성, 주간 범위 조회(최신순),
// 게스트 미기록·403 거부, 비로그인 401 거부, 후속 쓰기 실패 보고를 검증한다.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyFortune } from '../src/game/rules/fortune.js';
import type { GameState } from '../src/game/rules/logic.js';
import { SNAPSHOT_EVERY } from '../src/game/rules/balance.js';
import {
  callAction, captureRealClock, fish, seedUser, seededRandom, sessionHeaders, startActionEnv, testUid, userToken,
} from './_dbTest/actionHarness.js';
import type { ActionEnv, SeedOptions } from './_dbTest/actionHarness.js';

const hook = { failRecord: false };

vi.mock('./observability.js', () => ({ reportServerIssue: vi.fn(async () => undefined) }));
vi.mock('./_data/fortune.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./_data/fortune.js')>();
  return {
    ...actual,
    recordDailyFortune: async (...args: Parameters<typeof actual.recordDailyFortune>) => {
      if (hook.failRecord) {
        hook.failRecord = false;
        throw new Error('simulated-fortune-write-error');
      }
      return actual.recordDailyFortune(...args);
    },
  };
});

import { reportServerIssue } from './observability.js';
import fortuneHandler from './fortune.js';

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
  hook.failRecord = false;
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

async function callHistory(token: string | null, method = 'GET'): Promise<{ status: number; body: unknown }> {
  const out = { status: 0, body: undefined as unknown };
  const res = {
    setHeader() {},
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
  };
  await fortuneHandler({ method, headers: { ...sessionHeaders(token) } } as never, res as never);
  return out;
}

const storedFortune = async (uid: string) =>
  (await env.client.query<{ data: GameState }>('select data from public.saves_current where user_id = $1', [uid])).rows[0].data.fortune;

const fortuneRows = async (uid: string): Promise<DailyFortune[]> =>
  (await env.client.query<{ day: string; kind: DailyFortune['kind']; index: number }>(
    'select day, kind, index from public.daily_fortunes where user_id = $1 order by day desc', [uid],
  )).rows.map(r => ({ day: r.day, kind: r.kind, index: Number(r.index) as 3 | 5 }));

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

    expect((await callAction(userToken(uid), { type: 'boot' })).status).toBe(200);
    expect(await fortuneRows(uid)).toEqual([{ day: '2030-03-06', kind: 'gold', index: 5 }]);

    // DB에 이미 다른 값의 행이 먼저 있더라도 on conflict do nothing으로 유지한다
    await env.client.query(`update public.daily_fortunes set kind = 'shadow', index = 3 where user_id = $1 and day = '2030-03-06'`, [uid]);
    await rewind(uid);
    expect((await callAction(userToken(uid), { type: 'boot' })).status).toBe(200);
    expect(await fortuneRows(uid)).toEqual([{ day: '2030-03-06', kind: 'shadow', index: 3 }]);
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

  it('GET /api/fortune/history는 지난주 월요일 이후 이력을 최신순으로 돌려주고 이전 날짜는 제외한다', async () => {
    const uid = await seed({ state: {} });
    const rows: DailyFortune[] = [
      { day: '2030-02-23', kind: 'fish', index: 3 },   // 지난주 이전(제외)
      { day: '2030-02-24', kind: 'gold', index: 5 },   // 지지난주 일요일(제외)
      { day: '2030-02-25', kind: 'shadow', index: 3 }, // 지난주 월요일(포함 경계)
      { day: '2030-03-03', kind: 'gold', index: 5 },   // 지난주 일요일(포함)
      { day: '2030-03-04', kind: 'fish', index: 5 },   // 이번 주 월요일(포함)
    ];
    for (const r of rows) {
      await env.client.query(
        'insert into public.daily_fortunes (user_id, day, kind, index) values ($1, $2, $3, $4)',
        [uid, r.day, r.kind, r.index],
      );
    }

    // 오늘 접속 전에는 today가 null이고 지난주 월요일 이후 이력만 최신순이다
    const beforeBoot = await callHistory(userToken(uid));
    expect(beforeBoot).toEqual({
      status: 200,
      body: {
        today: null,
        currentDay: '2030-03-06',
        history: [
          { day: '2030-03-04', kind: 'fish', index: 5 },
          { day: '2030-03-03', kind: 'gold', index: 5 },
          { day: '2030-02-25', kind: 'shadow', index: 3 },
        ],
      },
    });

    // 오늘 boot 후에는 today와 history 선두가 오늘 운세로 채워진다
    await callAction(userToken(uid), { type: 'boot' });
    const todayFortune = (await storedFortune(uid))!;
    const afterBoot = await callHistory(userToken(uid));
    expect(afterBoot).toEqual({
      status: 200,
      body: {
        today: todayFortune,
        currentDay: '2030-03-06',
        history: [
          todayFortune,
          { day: '2030-03-04', kind: 'fish', index: 5 },
          { day: '2030-03-03', kind: 'gold', index: 5 },
          { day: '2030-02-25', kind: 'shadow', index: 3 },
        ],
      },
    });
  });

  it('KST 04:00 게임 날짜 경계에 맞춰 currentDay와 주간 필터 범위를 계산한다', async () => {
    const uid = await seed({ state: {} });
    // KST 2030-03-05 03:59:59 → 게임 날짜 2030-03-04 (월요일), 지난주 월요일 2030-02-25
    vi.setSystemTime(new Date('2030-03-04T18:59:59.000Z'));
    await callAction(userToken(uid), { type: 'boot' });
    const day4 = await callHistory(userToken(uid));
    expect(day4.status).toBe(200);
    expect((day4.body as { currentDay: string; today: DailyFortune | null })).toMatchObject({
      currentDay: '2030-03-04',
      today: { day: '2030-03-04' },
    });

    // KST 2030-03-05 04:00:00 → 게임 날짜 2030-03-05 (화요일)
    await rewind(uid);
    vi.setSystemTime(new Date('2030-03-04T19:00:00.000Z'));
    await callAction(userToken(uid), { type: 'boot' });
    const day5 = await callHistory(userToken(uid));
    expect(day5.status).toBe(200);
    expect((day5.body as { currentDay: string; history: DailyFortune[] }).currentDay).toBe('2030-03-05');
    expect((day5.body as { history: DailyFortune[] }).history.map(h => h.day)).toEqual(['2030-03-05', '2030-03-04']);
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

  it('일일 운세 이력 후속 쓰기가 실패해도 boot 응답은 성공하고 오류를 보고한다', async () => {
    const uid = await seed({ state: {} });
    hook.failRecord = true;
    const res = await callAction(userToken(uid), { type: 'boot' });
    expect(res.status).toBe(200);
    expect(await fortuneRows(uid)).toEqual([]);
    expect(reportServerIssue).toHaveBeenCalledTimes(1);
    expect(reportServerIssue).toHaveBeenCalledWith(
      '후속 쓰기 실패 — 일일 운세 이력 유실',
      expect.any(Error),
      expect.objectContaining({ uid, action: 'boot' }),
    );
  });
});
