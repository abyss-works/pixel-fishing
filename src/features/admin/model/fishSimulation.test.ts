import { describe, expect, it } from 'vitest';
import { FISH, SPOTS } from '../../../game/rules/logic';
import type { SpotId } from '../../../game/content/spots';
import { rarityWeightsOf } from '../../../game/content/rarityWeights';
import {
  buildFishDeltaExport, buildFishSnapshotExport, countSimulationOverrides,
  filterSpots, selectFishForSpot, selectSpotAxisEvs, selectSpotBudgets, selectSpotDraws,
  selectSpotNightDraws, SPOT_RARITY_OPTIONS, SPOT_ZONE_OPTIONS,
} from './fishSimulation';
import type { SimOverrides } from './fishSimulation';

const emptySimulation: SimOverrides = { budgets: {}, fishWeights: {}, price: {} };

describe('어종 시뮬레이션 데이터', () => {
  it('낮·밤 어종을 구분하고 등급 순으로 반환한다', () => {
    const spot = SPOTS.find(row => FISH.some(fish => fish.spot === row.id && fish.night))!;
    const day = selectFishForSpot(spot.id as SpotId, false);
    const night = selectFishForSpot(spot.id as SpotId, true);
    expect(day.every(fish => !fish.night)).toBe(true);
    expect(night.every(fish => fish.night)).toBe(true);
  });

  it('오버라이드가 기대값·확률 행·변경 수에 반영된다', () => {
    const spot = SPOTS[0].id as SpotId;
    const fish = FISH.find(row => row.spot === spot)!;
    const simulation: SimOverrides = {
      budgets: {}, fishWeights: {}, price: { [fish.id]: fish.price * 2 },
    };
    const baseline = selectSpotAxisEvs(spot, emptySimulation);
    const changed = selectSpotAxisEvs(spot, simulation);

    expect(changed.normal).toBeGreaterThan(baseline.normal);
    expect(selectSpotDraws(spot, simulation).get(fish.id)?.price).toBe(fish.price * 2);
    expect(countSimulationOverrides(simulation)).toBe(1);
  });

  it('현황 및 변경량 내보내기는 전달한 시각과 현재 오버라이드만 기록한다', () => {
    const spot = SPOTS[0].id as SpotId;
    const simulation: SimOverrides = {
      budgets: { [spot]: { rare: 50 } },
      fishWeights: {},
      price: {},
    };
    const evs = new Map([[spot, selectSpotAxisEvs(spot, simulation)]]);
    const snapshot = buildFishSnapshotExport(SPOTS.slice(0, 1), simulation, evs, 'now');
    const delta = buildFishDeltaExport(SPOTS.slice(0, 1), simulation, evs, 'now');

    expect(snapshot.exportedAt).toBe('now');
    expect(snapshot.spots).toHaveLength(1);
    expect(delta).toMatchObject({ deltaOnly: true, changedFields: 1 });
    expect(delta?.spots).toHaveLength(1);
    expect(buildFishDeltaExport(SPOTS.slice(0, 1), emptySimulation, evs, 'now')).toBeNull();
  });

  it('샌드박스에서 희귀·영웅·전설을 바꾸면 일반이 10000에서 나머지로 줄어든다', () => {
    const sim: SimOverrides = { budgets: { pond: { rare: 3000 } }, fishWeights: {}, price: {} };
    expect(selectSpotBudgets('pond', sim)).toEqual({ common: 6400, rare: 3000, epic: 500, legendary: 100 });
    expect(selectSpotBudgets('pond', emptySimulation)).toEqual(rarityWeightsOf('pond'));
  });

  it('샌드박스 값을 덮어쓰기로 옮기면 같은 확률과 EV가 나온다', () => {
    const sim: SimOverrides = { budgets: { pond: { rare: 3000 } }, fishWeights: {}, price: {} };
    const spot = SPOTS.find(s => s.id === 'pond')! as { rarityWeight?: unknown };
    const original = spot.rarityWeight;
    const viaSandbox = selectSpotAxisEvs('pond', sim);
    const drawsSandbox = [...selectSpotDraws('pond', sim)].map(([id, r]) => [id, r.fishPct]);
    try {
      spot.rarityWeight = { rare: 3000, epic: 500, legendary: 100 };
      expect(selectSpotAxisEvs('pond', emptySimulation)).toEqual(viaSandbox);
      expect([...selectSpotDraws('pond', emptySimulation)].map(([id, r]) => [id, r.fishPct])).toEqual(drawsSandbox);
    } finally {
      if (original === undefined) delete spot.rarityWeight; else spot.rarityWeight = original;
    }
  });

  it('구역·등급·검색 필터와 밤 풀 확률을 계산한다', () => {
    expect(SPOT_ZONE_OPTIONS.map(o => o.id)).toContain('northatlantic');
    expect(SPOT_RARITY_OPTIONS.map(o => o.id)).toEqual(['all', 'common', 'rare', 'epic', 'legendary']);
    expect(filterSpots(SPOTS, 'northatlantic', '').map(s => s.id)).toEqual(['azores', 'bermuda']);
    expect(filterSpots(SPOTS, 'all', '버뮤다').map(s => s.id)).toEqual(['bermuda']);
    expect(filterSpots(SPOTS, 'northatlantic', '', 'legendary').map(s => s.id))
      .toEqual(SPOTS.filter(s => ['azores', 'bermuda'].includes(s.id) && FISH.some(f => f.spot === s.id && f.rarity === 'legendary')).map(s => s.id));
    expect(filterSpots(SPOTS, 'all', '없는어종이름', 'common')).toEqual([]);

    const nightSpot = SPOTS.find(row => FISH.some(fish => fish.spot === row.id && fish.night))!;
    const nightFish = selectFishForSpot(nightSpot.id as SpotId, true)[0];
    const nightRow = selectSpotNightDraws(nightSpot.id as SpotId, emptySimulation).get(nightFish.id);
    expect(nightRow).toBeDefined();
    expect(nightRow!.fishPct).toBeGreaterThan(0);
    expect(nightRow!.gradePct).toBeGreaterThan(0);
  });
});
