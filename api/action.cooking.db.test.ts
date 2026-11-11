// 액션 경로의 요리 — 실제 Postgres에서 슬롯 효과가 캐치 경로(빠른 경로, 리듀서 경로)에 같게 걸리는지,
// 기운 얻기, 해역별 덮어쓰기, 조리, 먹기가 서버 시각과 서버 난수로 저장되는지, 게스트가 거부되는지 검사한다.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { COOKING_UNLOCK_BOAT, ENERGY_ITEM_IDS } from '../src/game/content/cooking.js';
import { SNAPSHOT_EVERY } from '../src/game/rules/balance.js';
import type { GameState } from '../src/game/rules/logic.js';
import { callAction, captureRealClock, dumpUser, fish, seedUser, seededRandom, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv, SeedOptions } from './_dbTest/actionHarness.js';

const NOW = '2030-03-04T05:06:07.000Z';
let env: ActionEnv;
let nextUid = 1401;

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

async function seed(opts: SeedOptions = {}): Promise<string> {
  const uid = testUid(nextUid++);
  return seedUser(env.client, { uid, email: `cook-${nextUid}@example.test`, ...opts });
}

/** 다음 액션이 페이싱에 걸리지 않게 직전 액션 시각을 과거로 돌린다 */
const rewind = (uid: string) =>
  env.client.query(`update public.saves_current set updated_at = '2026-01-01T00:00:00Z' where user_id = $1`, [uid]);

const stored = async (uid: string) => {
  const { rows } = await env.client.query<{ version: string; data: GameState }>(
    'select version, data from public.saves_current where user_id = $1', [uid]);
  return { version: Number(rows[0].version), data: rows[0].data };
};
const bagUids = async (uid: string) =>
  (await env.client.query<{ uid: string }>('select uid from public.fish_instances where user_id = $1', [uid])).rows.map(r => r.uid);
const eventsOf = async (uid: string) =>
  (await dumpUser(env.client, uid)).events as { type: string; payload: Record<string, unknown> }[];

describe('슬롯 효과와 캐치 이벤트', () => {
  const FUTURE = '2030-03-04T09:00:00.000Z';
  const PAST = '2030-03-04T05:00:00.000Z';
  const lunch = (endsAt: string): GameState['slots'] => ({ lunch: { id: 'cook-lunch-rare', endsAt }, bait: null });
  const bait = (endsAt: string): GameState['slots'] => ({ lunch: null, bait: { id: 'cook-bait-rare', endsAt } });
  // 빠른 경로는 개체 조회를 건너뛴다. 스냅샷 경계 버전은 풀 상태를 조립하는 리듀서 경로를 쓴다
  const PATHS = [['빠른 경로', 2], ['리듀서 경로', SNAPSHOT_EVERY - 1]] as const;

  const catchPayload = async (slots: GameState['slots'], judgment: string, version: number) => {
    const uid = await seed({ state: { slots }, version });
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment });
    expect(res.status).toBe(200);
    return (await eventsOf(uid)).find(e => e.type === 'catch')!.payload;
  };

  describe.each(PATHS)('%s', (_label, version) => {
    it('활성 도시락은 방치 캐치에만 걸리고 이벤트에 도시락 id가 남는다', async () => {
      const auto = await catchPayload(lunch(FUTURE), 'auto', version);
      expect(auto).toMatchObject({ lunch: 'cook-lunch-rare' });
      expect(auto).not.toHaveProperty('bait');
      const manual = await catchPayload(lunch(FUTURE), 'good', version);
      expect(manual).not.toHaveProperty('lunch');
      expect(manual).not.toHaveProperty('bait');
    });

    it('활성 미끼는 수동 캐치에만 걸리고 이벤트에 미끼 id가 남는다', async () => {
      const manual = await catchPayload(bait(FUTURE), 'perfect', version);
      expect(manual).toMatchObject({ bait: 'cook-bait-rare' });
      expect(manual).not.toHaveProperty('lunch');
      const auto = await catchPayload(bait(FUTURE), 'auto', version);
      expect(auto).not.toHaveProperty('bait');
      expect(auto).not.toHaveProperty('lunch');
    });

    it('끝나는 시각이 서버 시각과 같거나 지났으면 걸리지 않는다', async () => {
      for (const endsAt of [NOW, PAST]) {
        expect(await catchPayload(lunch(endsAt), 'auto', version)).not.toHaveProperty('lunch');
        expect(await catchPayload(bait(endsAt), 'normal', version)).not.toHaveProperty('bait');
      }
    });

    it('슬롯이 비어 있으면 슬롯 정보가 없다', async () => {
      const payload = await catchPayload({ lunch: null, bait: null }, 'good', version);
      expect(payload).not.toHaveProperty('lunch');
      expect(payload).not.toHaveProperty('bait');
    });
  });

  it('두 경로의 캐치 이벤트 payload가 같은 키를 가진다', async () => {
    const keys = async (version: number, judgment: string, slots: GameState['slots']) =>
      Object.keys(await catchPayload(slots, judgment, version)).filter(k => k !== 'pity').sort();
    for (const [judgment, slots] of [['auto', lunch(FUTURE)], ['perfect', bait(FUTURE)]] as const) {
      expect(await keys(2, judgment, slots)).toEqual(await keys(SNAPSHOT_EVERY - 1, judgment, slots));
    }
  });

  it('활성 도시락의 입질 단축이 캐치 간격 검사에 들어간다', async () => {
    const ago = (ms: number) => new Date(Date.parse(NOW) - ms).toISOString();
    const send = async (slots: GameState['slots']) => {
      const uid = await seed({ state: { slots }, lastCatchAt: ago(5_200) });
      return (await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'auto' })).status;
    };
    expect(await send({ lunch: null, bait: null })).toBe(429);
    expect(await send({ lunch: { id: 'cook-lunch-bite', endsAt: FUTURE }, bait: null })).toBe(200);
  });
});

describe('요리 액션', () => {
  const BOAT = COOKING_UNLOCK_BOAT;
  const ENERGY = ENERGY_ITEM_IDS;
  const HOME = { kind: 'base', id: 'home' } as const;
  const HARBOR = { kind: 'base', id: 'harbor' } as const;
  const cooker = (state: Partial<GameState> = {}, opts: SeedOptions = {}) =>
    seed({ state: { boat: BOAT, location: HOME, ...state }, ...opts });

  describe('기운 얻기', () => {
    it('개체를 지우고 등급별 기운을 쌓고 이벤트를 남긴다. 잠긴 개체와 가방에 없는 uid는 건너뛴다', async () => {
      const common = fish('crucian');
      const rare = fish('carp');
      const locked = fish('crucian', { locked: true });
      const uid = await cooker({ bag: [common, rare, locked] });
      const res = await callAction(userToken(uid), { type: 'extractEnergy', uids: [common.uid, rare.uid, locked.uid, 'none', common.uid] });
      expect(res.status).toBe(200);
      expect((res.body as { result: unknown }).result).toEqual({
        type: 'extract', energy: { common: 1, rare: 1, epic: 0, legendary: 0 },
      });
      expect(await bagUids(uid)).toEqual([locked.uid]);
      expect((await stored(uid)).data.items).toEqual({ [ENERGY.common]: 1, [ENERGY.rare]: 1 });
      expect((await eventsOf(uid)).map(e => e.type)).toEqual(['extractEnergy']);
    });

    it('대상이 하나도 없으면 상태를 바꾸지 않고 성공한다', async () => {
      const kept = fish('crucian', { locked: true });
      const uid = await cooker({ bag: [kept], items: { [ENERGY.common]: 3 } });
      const before = await stored(uid);
      const res = await callAction(userToken(uid), { type: 'extractEnergy', uids: [] });
      expect(res.status).toBe(200);
      expect((res.body as { result: unknown }).result).toMatchObject({ type: 'extract' });
      expect((await stored(uid)).data).toEqual(before.data);
      expect(await bagUids(uid)).toEqual([kept.uid]);
      expect(await eventsOf(uid)).toEqual([]);
    });

    it('집 밖에서는 not-at-home, 해금 전에는 cooking-locked로 거부한다', async () => {
      const f = fish('crucian');
      const away = await seed({ state: { boat: BOAT, location: HARBOR, bag: [f] } });
      expect(await callAction(userToken(away), { type: 'extractEnergy', uids: [f.uid] }))
        .toMatchObject({ status: 422, body: { error: 'not-at-home' } });
      const early = await seed({ state: { boat: BOAT - 1, location: HOME, bag: [fish('crucian')] } });
      expect(await callAction(userToken(early), { type: 'extractEnergy', uids: [f.uid] }))
        .toMatchObject({ status: 422, body: { error: 'cooking-locked' } });
      expect(await bagUids(away)).toEqual([f.uid]);
    });
  });

  describe('해역별 덮어쓰기', () => {
    it('고른 값은 기본값과 같아도 저장하고, 되돌리기는 모두 지운다. 위치는 제한하지 않는다', async () => {
      const uid = await seed({ state: { boat: BOAT, location: HARBOR } });
      const send = async (action: unknown) => { await rewind(uid); return callAction(userToken(uid), action); };
      expect((await send({ type: 'setEnergyTarget', spot: 'pond', on: false })).status).toBe(200);
      expect((await stored(uid)).data.energyTargets).toEqual({ pond: false });
      await send({ type: 'setEnergyTarget', spot: 'river', on: false });
      expect((await stored(uid)).data.energyTargets).toEqual({ pond: false, river: false });
      await send({ type: 'setEnergyTarget', spot: 'pond', on: true });
      expect((await stored(uid)).data.energyTargets).toEqual({ pond: true, river: false });
      expect((await send({ type: 'resetEnergyTargets' })).status).toBe(200);
      expect((await stored(uid)).data.energyTargets).toEqual({});
    });

    it('콘텐츠에 없는 해역과 해금 전 요청은 거부한다', async () => {
      const uid = await seed({ state: { boat: BOAT } });
      expect(await callAction(userToken(uid), { type: 'setEnergyTarget', spot: 'nowhere', on: false }))
        .toMatchObject({ status: 422, body: { error: 'bad-request' } });
      const early = await seed({ state: { boat: BOAT - 1 } });
      expect(await callAction(userToken(early), { type: 'resetEnergyTargets' }))
        .toMatchObject({ status: 422, body: { error: 'cooking-locked' } });
    });
  });

  describe('조리와 먹기', () => {
    const LUNCH = 'cook-lunch-bite';
    const lunchCost = (count: number) => ({ [ENERGY.common]: 200 * count });

    it('기운을 즉시 차감하고 서버 시각으로 시작한 조리 상태와 추첨을 저장한다', async () => {
      const uid = await cooker({ items: { ...lunchCost(2), [ENERGY.rare]: 5 } });
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      const res = await callAction(userToken(uid), { type: 'cook', recipe: LUNCH, count: 2, startedAt: '1999-01-01T00:00:00.000Z' });
      expect(res.status).toBe(200);
      const { data } = await stored(uid);
      expect(data.items).toEqual({ [ENERGY.rare]: 5 });
      expect(data.cooking).toEqual({ recipe: LUNCH, count: 2, bonus: [false, false], startedAt: NOW });
      expect((await eventsOf(uid)).map(e => e.type)).toEqual(['cook']);
    });

    it('진주 상인의 저울이 있으면 서버 난수로 추가 완성을 추첨해 저장한다', async () => {
      const uid = await cooker({ items: lunchCost(3), artifacts: ['varuna-scale'] });
      const draws = [0, 0.99, 0];
      vi.spyOn(Math, 'random').mockImplementation(() => draws.shift() ?? 0.99);
      expect((await callAction(userToken(uid), { type: 'cook', recipe: LUNCH, count: 3 })).status).toBe(200);
      expect((await stored(uid)).data.cooking?.bonus).toEqual([true, false, true]);
    });

    it('완성 수는 서버 시각의 경과로 계산하고, 먹으면 완성품을 보관함으로 정산해 슬롯에 넣는다', async () => {
      const uid = await cooker({ items: lunchCost(2), artifacts: ['varuna-scale'] });
      vi.spyOn(Math, 'random').mockReturnValue(0);
      await callAction(userToken(uid), { type: 'cook', recipe: LUNCH, count: 2 });
      // 완성 전에는 보관함에 없다
      await rewind(uid);
      vi.setSystemTime(Date.parse(NOW) + 59 * 60_000);
      expect(await callAction(userToken(uid), { type: 'eat', item: LUNCH }))
        .toMatchObject({ status: 422, body: { error: 'item-not-owned' } });
      // 1개가 완성되면 추가 완성분과 함께 2개가 보관함에 들어간다. 조리는 남은 1개로 이어진다
      await rewind(uid);
      const eatAt = Date.parse(NOW) + 61 * 60_000;
      vi.setSystemTime(eatAt);
      expect((await callAction(userToken(uid), { type: 'eat', item: LUNCH })).status).toBe(200);
      const { data } = await stored(uid);
      expect(data.items).toEqual({ [LUNCH]: 1 });
      expect(data.slots.lunch).toEqual({ id: LUNCH, endsAt: new Date(eatAt + 9 * 3_600_000).toISOString() });
      expect(data.cooking).toEqual({
        recipe: LUNCH, count: 1, bonus: [true], startedAt: new Date(Date.parse(NOW) + 3_600_000).toISOString(),
      });
      expect((await eventsOf(uid)).map(e => e.type).sort()).toEqual(['cook', 'eat']);
    });

    it('미끼 요리는 미끼 슬롯에 들어가고 이미 든 효과는 교체된다', async () => {
      const uid = await cooker({
        items: { 'cook-bait-judge': 2 }, slots: { lunch: null, bait: { id: 'cook-bait-rare', endsAt: '2030-03-04T05:30:00.000Z' } },
      });
      expect((await callAction(userToken(uid), { type: 'eat', item: 'cook-bait-judge' })).status).toBe(200);
      const { data } = await stored(uid);
      expect(data.items).toEqual({ 'cook-bait-judge': 1 });
      expect(data.slots.bait).toEqual({ id: 'cook-bait-judge', endsAt: '2030-03-04T05:36:07.000Z' });
    });

    it('거부 사유를 코드로 돌려주고 상태를 바꾸지 않는다', async () => {
      const uid = await cooker({ items: lunchCost(1) });
      const before = (await stored(uid)).data;
      const send = async (action: unknown) => { await rewind(uid); return callAction(userToken(uid), action); };
      expect(await send({ type: 'cook', recipe: 'nope', count: 1 })).toMatchObject({ status: 422, body: { error: 'bad-request' } });
      expect(await send({ type: 'cook', recipe: LUNCH, count: 2 })).toMatchObject({ status: 422, body: { error: 'not-enough-energy' } });
      expect(await send({ type: 'cook', recipe: LUNCH, count: 11 })).toMatchObject({ status: 422, body: { error: 'storage-full' } });
      expect(await send({ type: 'eat', item: LUNCH })).toMatchObject({ status: 422, body: { error: 'item-not-owned' } });
      expect((await stored(uid)).data).toEqual(before);
      const away = await seed({ state: { boat: BOAT, location: HARBOR, items: lunchCost(1) } });
      expect(await callAction(userToken(away), { type: 'cook', recipe: LUNCH, count: 1 }))
        .toMatchObject({ status: 422, body: { error: 'not-at-home' } });
    });

    it('조리 중에는 새 조리를 시작하지 않는다', async () => {
      const uid = await cooker({ items: lunchCost(2) });
      expect((await callAction(userToken(uid), { type: 'cook', recipe: LUNCH, count: 1 })).status).toBe(200);
      await rewind(uid);
      expect(await callAction(userToken(uid), { type: 'cook', recipe: LUNCH, count: 1 }))
        .toMatchObject({ status: 422, body: { error: 'cooking-busy' } });
    });
  });

  it('게스트는 요리 액션을 account-only로 거부당한다', async () => {
    const f = fish('crucian');
    const uid = await seed({
      email: null, state: { boat: BOAT, location: HOME, bag: [f], items: { [ENERGY.common]: 400, 'cook-lunch-bite': 1 } },
    });
    const before = await stored(uid);
    for (const action of [
      { type: 'extractEnergy', uids: [f.uid] }, { type: 'setEnergyTarget', spot: 'pond', on: false },
      { type: 'resetEnergyTargets' }, { type: 'cook', recipe: 'cook-lunch-bite', count: 1 }, { type: 'eat', item: 'cook-lunch-bite' },
    ]) {
      await rewind(uid);
      expect(await callAction(userToken(uid), action), JSON.stringify(action))
        .toMatchObject({ status: 403, body: { error: 'account-only' } });
    }
    expect((await stored(uid)).data).toEqual(before.data);
    expect(await bagUids(uid)).toEqual([f.uid]);
  });
});
