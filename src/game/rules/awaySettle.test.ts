import { describe, expect, it } from 'vitest';
import { FISH } from '../content/fish';
import { boatAt } from '../content/boats';
import { AUTO_ENERGY_BOAT, ENERGY_ITEM_IDS } from '../content/cooking';
import { WALK_BAG_CAP, newState } from './logic';
import type { FishInstance, GameState } from './logic';
import { AWAY_SETTLE_EVENT_TYPE, summarizeAway } from './away';
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

function mkBagFish(uid: string, fishId = 'carp', size = 20): FishInstance {
  return {
    uid,
    fishId,
    form: 'normal',
    size,
    caughtAt: '2026-10-16T00:00:00.000Z',
    spot: 'pond',
    judgment: 'auto',
    locked: false,
  };
}

describe('settleIdleWindow', () => {
  it('0초 및 음수 구간에서는 0건을 정산한다', () => {
    const state = newState();

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

  it('기본 규칙에서 도시락 없이도 모든 플레이어의 방치를 정산한다', () => {
    const noLunch = newState();
    const res = settleIdleWindow({
      state: noLunch,
      spotId: 'pond',
      fromMs: T_DAY_START,
      toMs: T_DAY_START + 30_000,
      seed: 'no-lunch-default',
      rules: { cycleMs: 10_000 },
    });
    expect(res.catches).toBe(3);
    expect(res.settledMs).toBe(30_000);
    expect(res.writes.instancesAdded.length).toBeGreaterThan(0);
    expect(res.writes.records.length).toBeGreaterThan(0);
    expect(res.commitData.fameDelta).toBeGreaterThan(0);
  });

  it('강태공 선수권 대회(championship)는 방치 정산에서 제외한다', () => {
    const state = { ...newState(), boat: 5, rod: 30 };
    const res = settleIdleWindow({
      state,
      spotId: 'championship',
      fromMs: T_DAY_START,
      toMs: T_DAY_START + HOUR_MS,
      seed: 'champ-excluded',
      rules: { cycleMs: 10_000 },
    });
    expect(res.catches).toBe(0);
    expect(res.settledMs).toBe(0);
    expect(res.nextState).toEqual(state);
  });

  it('rules.requireLunchbox=true 오버라이드 시 도시락 만료 시각까지만 절단한다', () => {
    const lunchEndsAtMs = T_DAY_START + 30_000;
    const state = makeLunchState(lunchEndsAtMs);

    const res = settleIdleWindow({
      state,
      spotId: 'pond',
      fromMs: T_DAY_START,
      toMs: T_DAY_START + 120_000,
      seed: 'lunch-mid-expire',
      rules: { requireLunchbox: true, cycleMs: 10_000 },
    });

    expect(res.catches).toBe(2);
    expect(res.settledAtMs).toBe(lunchEndsAtMs);
    expect(res.settledMs).toBe(30_000);
    expect(res.summary.catches).toBe(2);
  });

  it('20시간 상한을 넘는 구간은 20시간까지만 정산한다', () => {
    const fromMs = T_DAY_START;
    const toMs = fromMs + 48 * HOUR_MS;
    const state = newState();

    expect(DEFAULT_MAX_IDLE_WINDOW_MS).toBe(20 * HOUR_MS);

    const res = settleIdleWindow({
      state,
      spotId: 'pond',
      fromMs,
      toMs,
      seed: 'cap-20h',
      rules: { cycleMs: 60 * 60 * 1000 }, // 1시간당 1건
    });

    expect(res.settledMs).toBe(20 * HOUR_MS);
    expect(res.settledAtMs).toBe(fromMs + 20 * HOUR_MS);
    expect(res.catches).toBe(20);
  });

  it('낮/밤 경계를 교차하면 낮 구간에는 낮 어종만, 밤 구간에는 밤 어종도 함께 나온다', () => {
    const nightFishIds = new Set(FISH.filter(f => f.spot === 'barrierreef' && f.night).map(f => f.id));
    expect(nightFishIds.size).toBeGreaterThan(0);

    const fromMs = T_NIGHT_CROSS;
    const toMs = fromMs + 18 * 60 * 1000;
    const state = { ...newState(), boat: 3, rod: 30 };

    const res = settleIdleWindow({
      state,
      spotId: 'barrierreef',
      fromMs,
      toMs,
      seed: 'day-night-cross',
      rules: { cycleMs: 10_000 },
    });

    const catchEvents = res.events.filter(e => e.type === 'catch');
    expect(catchEvents.length).toBe(res.catches);

    const nightBoundaryIso = '2026-10-16T00:55:00.000Z';
    const dayCatches = catchEvents.filter(e => e.at < nightBoundaryIso);
    const nightCatches = catchEvents.filter(e => e.at >= nightBoundaryIso);

    expect(dayCatches.length).toBeGreaterThan(0);
    expect(nightCatches.length).toBeGreaterThan(0);

    for (const ev of dayCatches) {
      const fishId = (ev.payload as { fishId: string }).fishId;
      expect(nightFishIds.has(fishId)).toBe(false);
    }
    const nightCaughtNightSpecies = nightCatches.some(ev =>
      nightFishIds.has((ev.payload as { fishId: string }).fishId),
    );
    expect(nightCaughtNightSpecies).toBe(true);
  });

  it('가방이 가득 찬 상태에서 일반 배는 자동 방생, 가공 플랜트선은 자동 기운 추출로 분기한다', () => {
    const fullBag = Array.from({ length: WALK_BAG_CAP }, (_, i) => mkBagFish(`full-${i}`));
    const releaseState = { ...newState(), bag: fullBag, boat: 0 };

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
    expect(releasedRes.compactEvent.bagFullAt).not.toBeNull();
    // diffWrites는 최종 가방 차분만 포함한다
    expect(releasedRes.writes.instancesAdded.length).toBeLessThanOrEqual(WALK_BAG_CAP);

    const plantCap = boatAt(AUTO_ENERGY_BOAT)!.bagCap;
    const plantBag = Array.from({ length: plantCap }, (_, i) => mkBagFish(`plant-${i}`));
    const extractState = {
      ...newState(),
      bag: plantBag,
      boat: AUTO_ENERGY_BOAT,
      energyTargets: { pond: true },
    };

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

  it('토글식 자동 잠금이 켜져 있으면 가방 초과 시에도 자동 잠금 개체를 보호한다', () => {
    const state: GameState = {
      ...newState(),
      autoLockOnCatch: true,
      bag: Array.from({ length: WALK_BAG_CAP }, (_, i) => mkBagFish(`auto-lock-${i}`, 'carp', 1)),
    };
    const res = settleIdleWindow({
      state,
      spotId: 'pond',
      fromMs: T_DAY_START,
      toMs: T_DAY_START + 100_000,
      seed: 'auto-lock-idle',
      rules: { cycleMs: 10_000 },
    });
    expect(res.catches).toBe(10);
    expect(res.nextState.bag.some(f => f.locked)).toBe(true);
    expect(Object.keys(res.nextState.autoLockedIds).length).toBeGreaterThan(0);
  });

  it('compactEvent 1행을 summarizeAway에 넣으면 원본 이벤트 요약과 동일한 집계를 복원한다', () => {
    const fullBag = Array.from({ length: WALK_BAG_CAP }, (_, i) => mkBagFish(`compact-${i}`));
    const state = { ...newState(), bag: fullBag };
    const res = settleIdleWindow({
      state,
      spotId: 'pond',
      fromMs: T_DAY_START,
      toMs: T_DAY_START + 60_000,
      seed: 'compact-roundtrip',
      rules: { cycleMs: 10_000 },
    });
    const restored = summarizeAway(
      [{ type: AWAY_SETTLE_EVENT_TYPE, at: res.summary.to, payload: res.compactEvent }],
      { from: res.summary.from, to: res.summary.to, awayMs: res.summary.awayMs },
    );
    expect(restored).toEqual(res.summary);
  });

  it('동일한 시드로 호출하면 완전히 동일한 결과를 재현한다', () => {
    const state = newState();

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
});
