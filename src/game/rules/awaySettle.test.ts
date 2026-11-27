import { describe, expect, it } from 'vitest';
import { FISH } from '../content/fish';
import { boatAt } from '../content/boats';
import { AUTO_ENERGY_BOAT, ENERGY_ITEM_IDS } from '../content/cooking';
import { WALK_BAG_CAP, newState } from './logic';
import type { FishInstance, GameState } from './logic';
import { DEFAULT_MAX_IDLE_WINDOW_MS, settleIdleWindow } from './awaySettle';

const T_DAY_START = Date.parse('2026-10-16T00:15:00.000Z');   // 00:15 UTC = 낮 시작 (06:00)
const T_NIGHT_CROSS = Date.parse('2026-10-16T00:50:00.000Z'); // 00:50 UTC (낮) → 00:55 UTC (밤) 교차
const HOUR_MS = 60 * 60 * 1000;

function makeLunchState(endsAtMs: number, over: Partial<GameState> = {}): GameState {
  return {
    ...newState(),
    slots: { lunch: { id: 'cook-lunch-rare', endsAt: new Date(endsAtMs).toISOString() }, bait: null },
    ...over,
  };
}

function mkBagFish(uid: string, fishId = 'carp'): FishInstance {
  return {
    uid,
    fishId,
    form: 'normal',
    size: 20,
    caughtAt: '2026-10-16T00:00:00.000Z',
    spot: 'pond',
    judgment: 'auto',
    locked: false,
  };
}

describe('settleIdleWindow', () => {
  it('0초 및 음수 구간에서는 0건을 정산한다', () => {
    const state = makeLunchState(T_DAY_START + HOUR_MS);

    const zero = settleIdleWindow({
      state,
      spotId: 'pond',
      fromMs: T_DAY_START,
      toMs: T_DAY_START,
      seed: 'seed-zero',
    });
    expect(zero.catches).toBe(0);
    expect(zero.autoExtracted).toBe(0);
    expect(zero.autoReleased).toBe(0);
    expect(zero.settledMs).toBe(0);
    expect(zero.settledAtMs).toBe(T_DAY_START);
    expect(zero.nextState).toEqual(state);

    const negative = settleIdleWindow({
      state,
      spotId: 'pond',
      fromMs: T_DAY_START,
      toMs: T_DAY_START - 10_000,
      seed: 'seed-neg',
    });
    expect(negative.catches).toBe(0);
    expect(negative.settledMs).toBe(0);
    expect(negative.settledAtMs).toBe(T_DAY_START);
  });

  it('도시락 미장착이거나 이미 만료된 경우 0건을 정산한다', () => {
    const noLunch = newState();
    const res1 = settleIdleWindow({
      state: noLunch,
      spotId: 'pond',
      fromMs: T_DAY_START,
      toMs: T_DAY_START + HOUR_MS,
      seed: 'no-lunch',
    });
    expect(res1.catches).toBe(0);
    expect(res1.settledMs).toBe(0);

    const expiredLunch = makeLunchState(T_DAY_START);
    const res2 = settleIdleWindow({
      state: expiredLunch,
      spotId: 'pond',
      fromMs: T_DAY_START,
      toMs: T_DAY_START + HOUR_MS,
      seed: 'expired-lunch',
    });
    expect(res2.catches).toBe(0);
    expect(res2.settledMs).toBe(0);
  });

  it('도시락이 구간 중간에 만료되면 만료 시각까지만 절단해 정산한다', () => {
    const lunchEndsAtMs = T_DAY_START + 30_000;
    const state = makeLunchState(lunchEndsAtMs);

    const res = settleIdleWindow({
      state,
      spotId: 'pond',
      fromMs: T_DAY_START,
      toMs: T_DAY_START + 120_000,
      seed: 'lunch-mid-expire',
      rules: { cycleMs: 10_000 },
    });

    // 10s, 20s 지점만 도시락 활성 중(< 30s)으로 정산된다
    expect(res.catches).toBe(2);
    expect(res.settledAtMs).toBe(lunchEndsAtMs);
    expect(res.settledMs).toBe(30_000);
    expect(res.summary.catches).toBe(2);
  });

  it('24시간 상한을 넘는 구간은 상한까지만 정산한다', () => {
    const fromMs = T_DAY_START;
    const toMs = fromMs + 48 * HOUR_MS;
    const state = makeLunchState(toMs + HOUR_MS);

    expect(DEFAULT_MAX_IDLE_WINDOW_MS).toBe(24 * HOUR_MS);

    const res = settleIdleWindow({
      state,
      spotId: 'pond',
      fromMs,
      toMs,
      seed: 'cap-24h',
      rules: { cycleMs: 60 * 60 * 1000 }, // 1시간당 1건
    });

    expect(res.settledMs).toBe(24 * HOUR_MS);
    expect(res.settledAtMs).toBe(fromMs + 24 * HOUR_MS);
    expect(res.catches).toBe(24);
  });

  it('낮/밤 경계를 교차하면 낮 구간에는 낮 어종만, 밤 구간에는 밤 어종도 함께 나온다', () => {
    // barrierreef 해역은 rare 등급 밤 전용 어종(mooncoral)이 존재한다
    const nightFishIds = new Set(FISH.filter(f => f.spot === 'barrierreef' && f.night).map(f => f.id));
    expect(nightFishIds.size).toBeGreaterThan(0);

    const fromMs = T_NIGHT_CROSS; // 00:50 UTC (낮)
    const toMs = fromMs + 18 * 60 * 1000; // 01:08 UTC (밤 깊이 정점 01:05 UTC 통과)
    const state = makeLunchState(toMs + HOUR_MS, { boat: 3, rod: 30 });

    const res = settleIdleWindow({
      state,
      spotId: 'barrierreef',
      fromMs,
      toMs,
      seed: 'day-night-cross',
      rules: { cycleMs: 10_000 }, // 108건: 낮(00:50~00:55) + 밤(00:55~01:08)
    });

    const catchEvents = res.events.filter(e => e.type === 'catch');
    expect(catchEvents.length).toBe(res.catches);

    const nightBoundaryIso = '2026-10-16T00:55:00.000Z';
    const dayCatches = catchEvents.filter(e => e.at < nightBoundaryIso);
    const nightCatches = catchEvents.filter(e => e.at >= nightBoundaryIso);

    expect(dayCatches.length).toBeGreaterThan(0);
    expect(nightCatches.length).toBeGreaterThan(0);

    // 낮 구간에는 밤 전용 어종이 절대 등장하지 않는다
    for (const ev of dayCatches) {
      const fishId = (ev.payload as { fishId: string }).fishId;
      expect(nightFishIds.has(fishId)).toBe(false);
    }
    // 밤 구간에는 밤 전용 어종이 등장한다
    const nightCaughtNightSpecies = nightCatches.some(ev =>
      nightFishIds.has((ev.payload as { fishId: string }).fishId),
    );
    expect(nightCaughtNightSpecies).toBe(true);
  });

  it('가방이 가득 찬 상태에서 일반 배는 자동 방생, 가공 플랜트선은 자동 기운 추출로 분기한다', () => {
    // 일반 배(boat: 0, WALK_BAG_CAP) 가방을 가득 채운 상태
    const fullBag = Array.from({ length: WALK_BAG_CAP }, (_, i) => mkBagFish(`full-${i}`));
    const releaseState = makeLunchState(T_DAY_START + HOUR_MS, { bag: fullBag, boat: 0 });

    const releasedRes = settleIdleWindow({
      state: releaseState,
      spotId: 'pond',
      fromMs: T_DAY_START,
      toMs: T_DAY_START + 30_000,
      seed: 'overflow-release',
      rules: { cycleMs: 10_000 },
    });
    expect(releasedRes.catches).toBe(3);
    expect(releasedRes.autoReleased).toBe(3);
    expect(releasedRes.autoExtracted).toBe(0);
    expect(releasedRes.summary.released.count).toBe(3);
    expect(releasedRes.summary.extracted.count).toBe(0);

    // 가공 플랜트선(boat: AUTO_ENERGY_BOAT) + pond 기운 추출 대상 활성 상태
    const plantCap = boatAt(AUTO_ENERGY_BOAT)!.bagCap;
    const plantBag = Array.from({ length: plantCap }, (_, i) => mkBagFish(`plant-${i}`));
    const extractState = makeLunchState(T_DAY_START + HOUR_MS, {
      bag: plantBag,
      boat: AUTO_ENERGY_BOAT,
      energyTargets: { pond: true },
    });

    const extractedRes = settleIdleWindow({
      state: extractState,
      spotId: 'pond',
      fromMs: T_DAY_START,
      toMs: T_DAY_START + 30_000,
      seed: 'overflow-extract',
      rules: { cycleMs: 10_000 },
    });
    expect(extractedRes.catches).toBe(3);
    expect(extractedRes.autoExtracted).toBe(3);
    expect(extractedRes.autoReleased).toBe(0);
    expect(extractedRes.summary.extracted.count).toBe(3);
    const totalEnergy = Object.values(ENERGY_ITEM_IDS).reduce(
      (sum, itemId) => sum + (extractedRes.nextState.items[itemId] ?? 0),
      0,
    );
    expect(totalEnergy).toBeGreaterThan(0);
  });

  it('동일한 시드로 호출하면 완전히 동일한 결과를 재현한다', () => {
    const state = makeLunchState(T_DAY_START + HOUR_MS);

    const a = settleIdleWindow({
      state,
      spotId: 'pond',
      fromMs: T_DAY_START,
      toMs: T_DAY_START + 100_000,
      seed: 'deterministic-seed-42',
    });
    const b = settleIdleWindow({
      state,
      spotId: 'pond',
      fromMs: T_DAY_START,
      toMs: T_DAY_START + 100_000,
      seed: 'deterministic-seed-42',
    });

    expect(a).toEqual(b);
  });

  it('rules.requireLunchbox=false 오버라이드로 도시락 없이도 방치 정산이 가능하다', () => {
    const state = newState();
    const res = settleIdleWindow({
      state,
      spotId: 'pond',
      fromMs: T_DAY_START,
      toMs: T_DAY_START + 30_000,
      seed: 'base-idle-override',
      rules: { requireLunchbox: false, cycleMs: 10_000 },
    });
    expect(res.catches).toBe(3);
    expect(res.settledMs).toBe(30_000);
  });
});
