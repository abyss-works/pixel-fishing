import { describe, expect, it } from 'vitest';
import { FISH, SPOTS } from '../../../game/rules/logic';
import type { SpotId } from '../../../game/content/spots';
import {
  buildFishDeltaExport, buildFishSnapshotExport, countSimulationOverrides,
  selectFishForSpot, selectSpotAxisEvs, selectSpotDraws,
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
    const fish = FISH.find(row => row.spot === spot)!;
    const simulation: SimOverrides = {
      budgets: { [spot]: { [fish.rarity]: 50 } },
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
});
