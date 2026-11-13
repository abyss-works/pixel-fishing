// 가방이 찬 캐치의 자동 기운 얻기 — 실제 Postgres에서 빠른 경로와 리듀서 경로가 같은 결과를 내는지,
// 게스트와 가공 플랜트선 미만의 배가 놓아주는지, 방치 결과 보고가 기운으로 바꾼 수를 읽는지 검사한다.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_ENERGY_BOAT, ENERGY_ITEM_IDS, ENERGY_PER_INDIVIDUAL } from '../src/game/content/cooking.js';
import { SNAPSHOT_EVERY } from '../src/game/rules/balance.js';
import { BOATS } from '../src/game/rules/logic.js';
import type { GameState } from '../src/game/rules/logic.js';
import { callAction, captureRealClock, dumpUser, fish, seedUser, seededRandom, sessionHeaders, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv, SeedOptions } from './_dbTest/actionHarness.js';

const NOW = '2030-03-04T05:06:07.000Z';
let env: ActionEnv;
let nextUid = 1601;

beforeAll(async () => {
  env = await startActionEnv();
});
afterAll(async () => {
  await env?.stop();
});
beforeEach(() => {
  captureRealClock(() => performance.timeOrigin + performance.now());
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
  vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
  return () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  };
});

const PLANT = AUTO_ENERGY_BOAT;
const CAP = BOATS[PLANT - 1].bagCap;
const ENERGY = ENERGY_ITEM_IDS;
const PATHS = [['빠른 경로', 2], ['리듀서 경로', SNAPSHOT_EVERY - 1]] as const;

type Stored = { events: { type: string; payload: Record<string, unknown> }[] };

/** 가방을 가득 채운 연못 낚시꾼. 이메일이 없으면 게스트다 */
async function seed(opts: { boat?: number; guest?: boolean; version?: number; state?: Partial<GameState> } = {}): Promise<string> {
  const boat = opts.boat ?? PLANT;
  const bag = Array.from({ length: BOATS[boat - 1].bagCap }, (_, i) => fish('crucian', { size: 10 + i }));
  const seedOpts: SeedOptions = {
    uid: testUid(nextUid++), version: opts.version ?? 2, state: { boat, bag, ...opts.state },
    ...(opts.guest ? {} : { email: `overflow-${nextUid}@example.test` }),
  };
  return seedUser(env.client, seedOpts);
}

const rewind = (uid: string) =>
  env.client.query(`update public.saves_current set updated_at = '2026-01-01T00:00:00Z' where user_id = $1`, [uid]);
const stored = async (uid: string) => {
  const { rows } = await env.client.query<{ data: GameState }>('select data from public.saves_current where user_id = $1', [uid]);
  return rows[0].data;
};
const bagCount = async (uid: string) =>
  Number((await env.client.query('select count(*) from public.fish_instances where user_id = $1', [uid])).rows[0].count);
// 같은 액션의 이벤트는 시각이 같아 덤프 순서가 정해지지 않는다. 유형 순으로 정렬해 돌려준다
const eventsOf = async (uid: string) =>
  (await dumpUser(env.client, uid) as unknown as Stored).events.sort((a, b) => a.type.localeCompare(b.type));
const energyTotal = (data: GameState) =>
  Object.values(data.items ?? {}).reduce((a, b) => a + b, 0);

async function catchOnce(uid: string) {
  await rewind(uid);
  const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'normal' });
  expect(res.status).toBe(200);
  return res;
}

describe.each(PATHS)('가방이 찬 가공 플랜트선 - %s', (_label, version) => {
  it('기운 대상 개체는 기운이 되고 가방에서 지워지며 방생 이벤트가 없다', async () => {
    const uid = await seed({ version });
    const res = await catchOnce(uid);
    const result = (res.body as { result: { released: unknown[]; extracted?: unknown[]; energy?: Record<string, number> } }).result;
    expect(result.released).toEqual([]);
    expect(result.extracted).toHaveLength(1);
    const data = await stored(uid);
    expect(energyTotal(data)).toBe(ENERGY_PER_INDIVIDUAL);
    expect(Object.keys(data.items)).toHaveLength(1);
    expect(Object.values(ENERGY)).toContain(Object.keys(data.items)[0]);
    expect(Object.values(result.energy ?? {}).reduce((a, b) => a + b, 0)).toBe(ENERGY_PER_INDIVIDUAL);
    expect(await bagCount(uid)).toBe(CAP);
    const events = await eventsOf(uid);
    expect(events.map(e => e.type)).toEqual(['autoExtractEnergy', 'catch']);
    const payload = events[0].payload as { uids: string[]; reason: string; energy: Record<string, number>; fish: unknown[] };
    expect(payload.reason).toBe('bag-full');
    expect(payload.uids).toHaveLength(1);
    expect(payload.fish).toHaveLength(1);
    expect(Object.values(payload.energy).reduce((a, b) => a + b, 0)).toBe(ENERGY_PER_INDIVIDUAL);
  });

  it('기운 대상이 아닌 해역의 개체는 놓아준다', async () => {
    const uid = await seed({ version, state: { energyTargets: { pond: false } } });
    const res = await catchOnce(uid);
    const result = (res.body as { result: { released: unknown[]; extracted?: unknown[] } }).result;
    expect(result.released).toHaveLength(1);
    expect(result).not.toHaveProperty('extracted');
    expect(energyTotal(await stored(uid))).toBe(0);
    expect((await eventsOf(uid)).map(e => e.type)).toEqual(['autoRelease', 'catch']);
    expect(await bagCount(uid)).toBe(CAP);
  });

  it('게스트는 가공 플랜트선이 있어도 놓아준다', async () => {
    const uid = await seed({ version, guest: true });
    const res = await catchOnce(uid);
    const result = (res.body as { result: { released: unknown[] } }).result;
    expect(result.released).toHaveLength(1);
    expect(result).not.toHaveProperty('extracted');
    expect(energyTotal(await stored(uid))).toBe(0);
    expect((await eventsOf(uid)).map(e => e.type)).toEqual(['autoRelease', 'catch']);
  });

  it('가공 플랜트선 아래 단계의 배는 놓아준다', async () => {
    const uid = await seed({ version, boat: PLANT - 1 });
    const res = await catchOnce(uid);
    expect((res.body as { result: { released: unknown[] } }).result.released).toHaveLength(1);
    expect(energyTotal(await stored(uid))).toBe(0);
    expect((await eventsOf(uid)).map(e => e.type)).toEqual(['autoRelease', 'catch']);
  });

  it('가방이 차지 않았으면 기운을 얻지 않는다', async () => {
    const uid = await seedUser(env.client, { uid: testUid(nextUid++), email: `overflow-${nextUid}@example.test`, version,
      state: { boat: PLANT, bag: [fish('crucian')] } });
    await catchOnce(uid);
    expect(energyTotal(await stored(uid))).toBe(0);
    expect((await eventsOf(uid)).map(e => e.type)).toEqual(['catch']);
  });
});

describe('두 경로의 결과', () => {
  it('빠른 경로와 리듀서 경로가 같은 모양의 결과, 이벤트, 저장 상태를 낸다', async () => {
    const shape = async (version: number) => {
      const uid = await seed({ version });
      const res = await catchOnce(uid);
      const result = (res.body as { result: Record<string, unknown> }).result;
      const events = await eventsOf(uid);
      const data = await stored(uid);
      return {
        resultKeys: Object.keys(result).sort(),
        extractedKeys: Object.keys((result.extracted as object[])[0]).sort(),
        events: events.map(e => [e.type, Object.keys(e.payload).sort()]),
        energy: result.energy,
        itemKeys: Object.keys(data.items),
        bag: await bagCount(uid),
      };
    };
    const fast = await shape(2);
    const full = await shape(SNAPSHOT_EVERY - 1);
    // 놓아줄 개체의 등급은 추첨에 따라 갈릴 수 있어 양의 합과 모양만 비교한다
    const total = (e: unknown) => Object.values(e as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(total(fast.energy)).toBe(total(full.energy));
    expect({ ...fast, energy: 0, itemKeys: fast.itemKeys.length }).toEqual({ ...full, energy: 0, itemKeys: full.itemKeys.length });
  });
});

describe('방치 결과 보고', () => {
  it('기운으로 바꾼 수와 등급별 양을 읽고 가방이 찬 시각을 첫 방생과 첫 기운 얻기 중 먼저인 것으로 잡는다', async () => {
    const uid = await seedUser(env.client, { uid: testUid(nextUid++), email: `overflow-${nextUid}@example.test`, state: {} });
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    const insert = (type: string, payload: unknown, at: string) =>
      env.client.query('insert into public.events (user_id, type, payload, created_at) values ($1, $2, $3, $4)', [uid, type, payload, at]);
    const gone = (u: string) => ({ uid: u, fishId: 'crucian', form: 'normal' });
    await insert('autoRelease', { uids: ['r1'], reason: 'bag-full', fish: [gone('r1')] }, minutesAgo(20));
    await insert('autoExtractEnergy', { uids: ['x1'], reason: 'bag-full', energy: { common: 10, rare: 0, epic: 0, legendary: 0 }, fish: [gone('x1')] }, minutesAgo(40));
    await insert('autoExtractEnergy', { uids: ['x2', 'x3'], reason: 'bag-full', energy: { common: 10, rare: 10, epic: 0, legendary: 0 }, fish: [gone('x2'), gone('x3')] }, minutesAgo(10));
    await insert('autoExtractEnergy', { uids: ['x4'], reason: 'bag-full', energy: { common: 10, rare: 0, epic: 0, legendary: 0 }, fish: [gone('x4')] }, minutesAgo(90)); // 기간 밖

    const { default: handler } = await import('./awayReport.js');
    const out: { status: number; body: unknown } = { status: 0, body: undefined };
    const res = { status(c: number) { out.status = c; return res; }, json(b: unknown) { out.body = b; }, setHeader() {} };
    await handler({ method: 'GET', query: { awayMs: String(60 * 60_000) }, headers: sessionHeaders(userToken(uid)) } as never, res as never);
    expect(out.status).toBe(200);
    const body = out.body as { extracted: { count: number; energy: Record<string, number> }; released: { count: number }; bagFullAfterMs: number };
    expect(body.extracted).toEqual({ count: 3, energy: { common: 20, rare: 10, epic: 0, legendary: 0 } });
    expect(body.released.count).toBe(1);
    expect(body.bagFullAfterMs).toBeGreaterThan(19 * 60_000);
    expect(body.bagFullAfterMs).toBeLessThan(21 * 60_000);
  });
});
