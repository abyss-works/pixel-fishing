// 업적 — 실제 Postgres에서 카운터 upsert가 같은 확정 문장에 달리는지, 이벤트가 counted=true로
// 기록되는지, 저장 상태가 카운터·네임드 토벌 기록을 런타임 주입하는지(저장 blob에는 넣지 않는지),
// 수령 액션이 서버 재평가로 멱등 지급하는지, 업적 모자 구매가 거절되는지 검사한다.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS, achievementById } from '../src/game/content/achievements.js';
import { AUTO_ENERGY_BOAT, COOKING_UNLOCK_BOAT } from '../src/game/content/cooking.js';
import { BOUNTIES } from '../src/game/content/bounties.js';
import { LICENSE_GRADES, capOfBoat, newState, zoneDexMissing } from '../src/game/rules/logic.js';
import type { GameState } from '../src/game/rules/logic.js';
import { gameDayOf } from '../src/game/rules/time.js';
import { hatById, isAchievementHat } from '../src/game/content/wardrobe.js';
import { database } from './_db/client.js';
import {
  callAction, captureRealClock, fish, seedUser, seededRandom, startActionEnv,
  testUid, userToken,
} from './_dbTest/actionHarness.js';
import type { ActionEnv, SeedOptions } from './_dbTest/actionHarness.js';

const NOW = '2030-03-04T05:06:07.000Z';
let env: ActionEnv;
let nextUid = 2401;

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
    process.env.DEPLOY_ENV = 'local';
  };
});

async function seed(opts: SeedOptions = {}): Promise<string> {
  const uid = testUid(nextUid++);
  return seedUser(env.client, { uid, email: `achv-${nextUid}@example.test`, ...opts });
}

const rewind = (uid: string) =>
  env.client.query(`update public.saves_current set updated_at = '2026-01-01T00:00:00Z' where user_id = $1`, [uid]);

const counters = async (uid: string): Promise<Record<string, number>> => {
  const { rows } = await env.client.query<{ key: string; value: string }>(
    'select key, value from public.achievement_counters where user_id = $1', [uid]);
  return Object.fromEntries(rows.map(r => [r.key, Number(r.value)]));
};
const eventsOf = async (uid: string) =>
  (await env.client.query<{ type: string; payload: Record<string, unknown>; counted: boolean }>(
    'select type, payload, counted from public.events where user_id = $1 order by id', [uid])).rows;
const stored = async (uid: string) =>
  (await env.client.query<{ data: Record<string, unknown> }>(
    'select data from public.saves_current where user_id = $1', [uid])).rows[0].data;
const goldOf = async (uid: string) =>
  Number((await env.client.query<{ gold: string }>('select gold from public.saves_current where user_id = $1', [uid])).rows[0].gold);

/** 해역 비전설(일반~영웅) 또는 라이선스 도감 조건을 채운 도감 */
function zoneDex(zone: 'pacific', tier: keyof typeof LICENSE_GRADES): GameState['dex'] {
  const grades = tier === 'basic' ? (['common', 'rare', 'epic'] as const) : LICENSE_GRADES[tier];
  const dex: GameState['dex'] = {};
  for (const id of zoneDexMissing(newState(), zone, grades)) {
    dex[id] = { normal: { count: 1, maxSize: 30, first: '2026-01-01' } };
  }
  return dex;
}

describe('카운터 upsert와 counted 플래그', () => {
  it('판매는 sell.gold 카운터를 같은 확정으로 올리고 이벤트를 counted=true로 남긴다', async () => {
    const sold = fish('carp', { size: 30 });
    const uid = await seed({ state: { bag: [sold] } });
    const res = await callAction(userToken(uid), { type: 'sell', uids: [sold.uid] });
    expect(res.status).toBe(200);
    const gold = (res.body as { result: { gold: number } }).result.gold;
    expect(await counters(uid)).toEqual({ 'sell.gold': gold });
    expect(await eventsOf(uid)).toEqual([
      { type: 'sell', payload: { gold, count: 1, uids: [sold.uid] }, counted: true },
    ]);
  });

  it('빠른 캐치 경로도 카운터를 올리고 이벤트를 counted=true로 남긴다', async () => {
    const uid = await seed({ state: {}, version: 2 });
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'auto' });
    expect(res.status).toBe(200);
    expect(await counters(uid)).toEqual({ 'catch.auto': 1 });
    expect((await eventsOf(uid))[0].counted).toBe(true);
  });

  it('미끼를 쓴 캐치는 catch.bait을 올린다', async () => {
    const uid = await seed({
      state: {
        items: { 'cook-bait-rare': 1 },
        // 미끼 슬롯이 끝나지 않게 미래 시각에 넣는다
        slots: { lunch: null, bait: { id: 'cook-bait-rare', endsAt: '2030-03-04T09:00:00Z' } },
      },
      version: 2,
    });
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'good' });
    expect(res.status).toBe(200);
    expect((await counters(uid))['catch.bait']).toBe(1);
  });

  it('도시락이 켜진 방치 캐치는 catch.lunch를 올리고 이벤트를 counted=true로 남긴다', async () => {
    const uid = await seed({
      state: {
        slots: { lunch: { id: 'cook-lunch-bite', endsAt: '2030-03-04T09:00:00Z' }, bait: null },
      },
      version: 2,
    });
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'auto' });
    expect(res.status).toBe(200);
    expect(await counters(uid)).toEqual({ 'catch.auto': 1, 'catch.lunch': 1 });
    expect((await eventsOf(uid))[0].counted).toBe(true);
  });

  it('조리는 소모 기운을 일반 기운 등가로 환산해 energy.spent를 올리고 이벤트를 counted=true로 남긴다', async () => {
    const uid = await seed({
      state: {
        boat: COOKING_UNLOCK_BOAT,
        location: { kind: 'base', id: 'home' },
        items: { 'energy-common': 6000 },
      },
    });
    const res = await callAction(userToken(uid), { type: 'cook', recipe: 'cook-lunch-bite', count: 1 });
    expect(res.status).toBe(200);
    expect(await counters(uid)).toEqual({ 'energy.spent': 600 });
    expect((await eventsOf(uid))[0].counted).toBe(true);
  });

  it('네임드 결투 무실패 성공은 named.flawless를 올린다', async () => {
    const uid = await seed({ state: { dex: zoneDex('pacific', 'named'), location: { kind: 'base', id: 'harbor' } } });
    const named = BOUNTIES.find(q => q.id === 'pacific-named-megalodon')!;
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
      [uid, named.zone, named.id, NOW]);
    await env.client.query('insert into public.bounty_tickets (user_id, quest_id, issued_at) values ($1, $2, $3)',
      [uid, named.id, NOW]);
    const hp = 99;
    const res = await callAction(userToken(uid), { type: 'resolveChallenge', questId: named.id, success: true, hits: hp, misses: 0 });
    expect(res.status).toBe(200);
    expect(await counters(uid)).toEqual({ 'named.flawless': 1 });
    // 토벌한 네임드는 저장 blob이 아니라 bounty_clears에 남는다
    const clears = await env.client.query<{ quest_id: string }>(
      `select quest_id from public.bounty_clears where user_id = $1 and kind = 'named'`, [uid]);
    expect(clears.rows.map(r => r.quest_id)).toEqual([named.id]);
  });
});

describe('저장 상태 런타임 주입', () => {
  it('액션 응답 델타의 스칼라에 카운터와 토벌한 네임드가 실린다', async () => {
    const uid = await seed({ state: {} });
    await env.client.query(`insert into public.achievement_counters (user_id, key, value) values ($1, 'sell.gold', 777)`, [uid]);
    await env.client.query(`insert into public.bounty_clears (user_id, kind, quest_id) values ($1, 'named', 'pacific-named-megalodon')`, [uid]);
    const res = await callAction(userToken(uid), { type: 'boot' });
    expect(res.status).toBe(200);
    const scalars = (res.body as { patch: { scalars: GameState } }).patch.scalars;
    expect(scalars.achievementCounters).toEqual({ 'sell.gold': 777 });
    expect(scalars.clearedNamed).toEqual(['pacific-named-megalodon']);
    // 런타임 전용 값은 저장 blob에 넣지 않는다
    const blob = await stored(uid);
    expect(blob).not.toHaveProperty('achievementCounters');
    expect(blob).not.toHaveProperty('clearedNamed');
  });
});

describe('업적 수령', () => {
  const progressId = 'spot-basic-sea';
  const goldReward = achievementById(progressId)!.reward;
  const hatAchievement = ACHIEVEMENTS.find(a => a.id === 'variant-village')!;

  it('claimable 업적을 받으면 골드를 지급하고 claimed로 바꾼다', async () => {
    const uid = await seed({ state: { gold: 0, achievements: { [progressId]: 'claimable' } } });
    const res = await callAction(userToken(uid), { type: 'claimAchievement', id: progressId });
    expect(res.status).toBe(200);
    const paid = goldReward.kind === 'gold' ? goldReward.gold : 0;
    expect(await goldOf(uid)).toBe(paid);
    expect((await stored(uid)).achievements).toMatchObject({ [progressId]: 'claimed' });
    // 같은 업적은 두 번 못 받는다 — 멱등이 아니라 거절이어야 한다
    await rewind(uid);
    const again = await callAction(userToken(uid), { type: 'claimAchievement', id: progressId });
    expect(again.status).toBe(422);
    expect(await goldOf(uid)).toBe(paid);
  });

  it('모자 보상 업적은 가진 모자에 더한다', async () => {
    const uid = await seed({ state: { achievements: { [hatAchievement.id]: 'claimable' } } });
    const res = await callAction(userToken(uid), { type: 'claimAchievement', id: hatAchievement.id });
    expect(res.status).toBe(200);
    expect((await stored(uid)).hats).toContain('straw-hat');
  });

  it('모두 받기는 claimable 업적만 지급하고 이미 받은 것은 건드리지 않는다', async () => {
    const uid = await seed({ state: { gold: 0, achievements: { [progressId]: 'claimable', [hatAchievement.id]: 'claimed' } } });
    const res = await callAction(userToken(uid), { type: 'claimAllAchievements' });
    expect(res.status).toBe(200);
    const paid = goldReward.kind === 'gold' ? goldReward.gold : 0;
    expect(await goldOf(uid)).toBe(paid);
    const stored_ = await stored(uid);
    expect(stored_.achievements).toMatchObject({ [progressId]: 'claimed', [hatAchievement.id]: 'claimed' });
  });

  it('받을 수 없는 업적의 수령은 거절하고 아무것도 쓰지 않는다', async () => {
    const uid = await seed({ state: { gold: 5 } });
    const res = await callAction(userToken(uid), { type: 'claimAchievement', id: progressId });
    expect(res.status).toBe(422);
    expect(await goldOf(uid)).toBe(5);
  });

  it('게스트의 수령은 account-only로 거절된다', async () => {
    const uid = testUid(nextUid++);
    await seedUser(env.client, { uid, state: { achievements: { [progressId]: 'claimable' } } });
    const res = await callAction(userToken(uid), { type: 'claimAchievement', id: progressId });
    expect(res.status).toBe(403);
    expect((res.body as { error: string }).error).toBe('account-only');
  });
});

describe('업적 모자 구매 제한', () => {
  it('업적 모자를 골드로 사려 하면 achievement-hat-only로 거절된다', async () => {
    const reward = ACHIEVEMENTS.find(a => a.reward.kind === 'hat')!.reward;
    const hatId = reward.kind === 'hat' ? reward.hatId : '';
    expect(isAchievementHat(hatById(hatId)!)).toBe(true);
    const uid = await seed({ state: { gold: 1_000_000 } });
    const res = await callAction(userToken(uid), { type: 'buyHat', hat: hatId });
    expect(res.status).toBe(422);
    expect((res.body as { error: string }).error).toBe('achievement-hat-only');
    expect(await goldOf(uid)).toBe(1_000_000);
  });
});

describe('소급 판정 및 초기 파생 상태 직후 수령', () => {
  it('도입 뒤 첫 액션 확정에서 이미 채운 조건의 업적이 claimable이 된다', async () => {
    const uid = await seed({ state: { dex: zoneDex('pacific', 'basic') } });
    const res = await callAction(userToken(uid), { type: 'boot' });
    expect(res.status).toBe(200);
    const scalars = (res.body as { patch: { scalars: GameState } }).patch.scalars;
    expect(scalars.achievements).toMatchObject({ 'spot-basic-sea': 'claimable', 'spot-basic-deep': 'claimable' });
  });

  it('boot 없이 saves_current.data.achievements가 비어 있어도 claimAchievement가 도감·토벌 근거를 선행 평가해 수령·저장한다', async () => {
    const uid = await seed({ state: { gold: 0, dex: zoneDex('pacific', 'basic'), achievements: {} } });
    await env.client.query(
      `insert into public.bounty_clears (user_id, kind, quest_id) values ($1, 'named', 'pacific-named-megalodon')`,
      [uid],
    );

    const res = await callAction(userToken(uid), { type: 'claimAchievement', id: 'spot-basic-sea' });
    expect(res.status).toBe(200);
    const seaReward = achievementById('spot-basic-sea')!.reward;
    const paid = seaReward.kind === 'gold' ? seaReward.gold : 0;
    expect(await goldOf(uid)).toBe(paid);
    expect((await stored(uid)).achievements).toMatchObject({
      'spot-basic-sea': 'claimed',
      'spot-basic-deep': 'claimable',
      'named-megalodon-1': 'claimable',
    });
  });

  it('boot 없이 saves_current.data.achievements가 비어 있어도 claimAllAchievements가 도감·토벌 근거를 선행 평가해 일괄 수령·저장한다', async () => {
    const uid = await seed({ state: { gold: 0, dex: zoneDex('pacific', 'basic'), achievements: {} } });
    await env.client.query(
      `insert into public.bounty_clears (user_id, kind, quest_id) values ($1, 'named', 'pacific-named-megalodon')`,
      [uid],
    );

    const res = await callAction(userToken(uid), { type: 'claimAllAchievements' });
    expect(res.status).toBe(200);
    const seaGold = achievementById('spot-basic-sea')!.reward;
    const deepGold = achievementById('spot-basic-deep')!.reward;
    const expectedGold = (seaGold.kind === 'gold' ? seaGold.gold : 0) + (deepGold.kind === 'gold' ? deepGold.gold : 0);
    expect(await goldOf(uid)).toBe(expectedGold);
    expect((await stored(uid)).achievements).toMatchObject({
      'spot-basic-sea': 'claimed',
      'spot-basic-deep': 'claimed',
      'named-megalodon-1': 'claimed',
    });
    expect((await stored(uid)).hats).toContain('megalodon-work-cap');
  });
});

describe('빠른 캐치 경로 업적 누적 보너스 연동', () => {
  it('fastCatch는 prepareCatchDraw에 도시락 증폭(lunchAmplify)을 전달한다', async () => {
    // cook-lunch-mutation(+0.5) 단독 변이 점유율 = 1.5/4.5 = 0.3333..., +15% 증폭(catch.lunch=20_000) = 1.575/4.575 = 0.3442...
    vi.spyOn(Math, 'random').mockReturnValue(0.338);
    const lunchSlot = { id: 'cook-lunch-mutation', endsAt: '2030-03-04T09:00:00Z' };
    const plainUid = await seed({ state: { slots: { lunch: lunchSlot, bait: null } }, version: 2 });
    const plainRes = await callAction(userToken(plainUid), { type: 'catch', spot: 'pond', judgment: 'auto' });
    expect(plainRes.status).toBe(200);
    expect((plainRes.body as { result: { info: { form: string } } }).result.info.form).toBe('normal');

    const boostedUid = await seed({ state: { slots: { lunch: lunchSlot, bait: null } }, version: 2 });
    await env.client.query(
      `insert into public.achievement_counters (user_id, key, value) values ($1, 'catch.lunch', 20000)`,
      [boostedUid],
    );
    const boostedRes = await callAction(userToken(boostedUid), { type: 'catch', spot: 'pond', judgment: 'auto' });
    expect(boostedRes.status).toBe(200);
    expect((boostedRes.body as { result: { info: { form: string } } }).result.info.form).toBe('variant');
  });

  it('fastCatch는 가방 초과 자동 기운 추출(planOverflow)에 기운 획득량 보너스(energyYield)를 전달한다', async () => {
    const fullBag = () => Array.from({ length: capOfBoat(AUTO_ENERGY_BOAT) }, () => fish('minnow'));
    const uid = await seed({
      state: {
        boat: AUTO_ENERGY_BOAT,
        energyTargets: { pond: true },
        bag: fullBag(),
      },
      version: 2,
    });
    await env.client.query(
      `insert into public.achievement_counters (user_id, key, value) values ($1, 'energy.spent', 100000)`,
      [uid],
    );
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'auto' });
    expect(res.status).toBe(200);
    expect((res.body as { result: { energy?: { common: number } } }).result.energy?.common).toBe(12);
  });

  it('fastCatch는 수동 카운터 없이 records만으로 지역 전설 보너스(rareWeight)를 drawCatch에 반영한다', async () => {
    const dayNow = '2030-03-04T05:30:00.000Z';
    vi.setSystemTime(new Date(dayNow));
    const fortune = { day: gameDayOf(dayNow), kind: 'gold' as const, index: 3 as const };
    const rolls = () => {
      const seq = [0.738, 0.1, 0.5, 0.5];
      let i = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => seq[i++] ?? 0.5);
    };

    const plainUid = await seed({ state: { boat: 1, rod: 6, fortune }, version: 2 });
    rolls();
    const plainRes = await callAction(userToken(plainUid), { type: 'catch', spot: 'sea', judgment: 'normal' });
    expect(plainRes.status).toBe(200);
    expect((plainRes.body as { result: { fishId: string } }).result.fishId).toBe('mackerel');

    const boostedUid = await seed({
      state: {
        boat: 1,
        rod: 6,
        fortune,
        dex: { shark: { normal: { count: 20, maxSize: 200, first: '2026-01-01' } } },
      },
      version: 2,
    });
    rolls();
    const boostedRes = await callAction(userToken(boostedUid), { type: 'catch', spot: 'sea', judgment: 'normal' });
    expect(boostedRes.status).toBe(200);
    expect((boostedRes.body as { result: { fishId: string } }).result.fishId).toBe('seabream');
  });

  it('fastCatch는 수동 카운터 없이 records만으로 지역 밤 전설 보너스(nightWeight)를 drawCatch에 반영한다', async () => {
    const nightPeak = '2030-03-04T05:05:00.000Z';
    vi.setSystemTime(new Date(nightPeak));
    const fortune = { day: gameDayOf(nightPeak), kind: 'gold' as const, index: 3 as const };
    const rolls = () => {
      const seq = [0.995, 0.331, 0.5, 0.5];
      let i = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => seq[i++] ?? 0.5);
    };

    const plainUid = await seed({ state: { boat: 1, rod: 6, fortune }, version: 2 });
    rolls();
    const plainRes = await callAction(userToken(plainUid), { type: 'catch', spot: 'sea', judgment: 'normal' });
    expect(plainRes.status).toBe(200);
    expect((plainRes.body as { result: { fishId: string } }).result.fishId).toBe('shark');

    const boostedUid = await seed({
      state: {
        boat: 1,
        rod: 6,
        fortune,
        dex: { moonveil: { normal: { count: 10, maxSize: 100, first: '2026-01-01' } } },
      },
      version: 2,
    });
    rolls();
    const boostedRes = await callAction(userToken(boostedUid), { type: 'catch', spot: 'sea', judgment: 'normal' });
    expect(boostedRes.status).toBe(200);
    expect((boostedRes.body as { result: { fishId: string } }).result.fishId).toBe('moonveil');
  });

  it('fastCatch는 수동 카운터 없이 변이 records만으로 지역 돌연변이 보너스(mutationWeight)를 drawCatch에 반영하고 중복 조회를 하지 않는다', async () => {
    const dayNow = '2030-03-04T05:30:00.000Z';
    vi.setSystemTime(new Date(dayNow));
    const fortune = { day: gameDayOf(dayNow), kind: 'gold' as const, index: 3 as const };
    const rolls = () => {
      const seq = [0.1, 0.1, 0.5, 0.5, 0.251];
      let i = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => seq[i++] ?? 0.5);
    };

    const allClaimed = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, 'claimed' as const]));
    const decidedUid = await seed({
      state: {
        boat: 1,
        rod: 6,
        fortune,
        achievements: allClaimed,
        dex: { mackerel: { variant: { count: 500, maxSize: 40, first: '2026-01-01' } } },
      },
      version: 2,
    });
    const spy = vi.spyOn(database().db, 'execute');
    spy.mockClear();
    rolls();
    const decidedRes = await callAction(userToken(decidedUid), { type: 'catch', spot: 'sea', judgment: 'normal' });
    const decidedQueries = spy.mock.calls.length;
    expect(decidedRes.status).toBe(200);
    expect((decidedRes.body as { result: { info: { form: string } } }).result.info.form).toBe('variant');

    const undecidedUid = await seed({
      state: {
        boat: 1,
        rod: 6,
        fortune,
        achievements: {},
        dex: { mackerel: { variant: { count: 500, maxSize: 40, first: '2026-01-01' } } },
      },
      version: 2,
    });
    spy.mockClear();
    rolls();
    const undecidedRes = await callAction(userToken(undecidedUid), { type: 'catch', spot: 'sea', judgment: 'normal' });
    const undecidedQueries = spy.mock.calls.length;
    spy.mockRestore();
    expect(undecidedRes.status).toBe(200);
    expect((undecidedRes.body as { result: { info: { form: string } } }).result.info.form).toBe('variant');
    expect(undecidedQueries).toBe(decidedQueries);
  });
});
