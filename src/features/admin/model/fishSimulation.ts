import { FISH, RARITY_ORDER, SPOTS, drawRows, rarityWeightOf } from '../../../game/rules/logic';
import type { DrawOptions, DrawRow, RarityId } from '../../../game/rules/logic';
import type { Fish } from '../../../game/content/fish';
import type { SpotId } from '../../../game/content/spots';
import type { Spot } from '../../../game/content/spots';

export interface SimOverrides {
  budgets: Record<string, Partial<Record<RarityId, number>>>;
  fishWeights: Record<string, Record<string, number>>;
  price: Record<string, number>;
}

export const SIM_AXES = [
  { key: 'normal', label: '무판정', mult: {}, group: 'manual' },
  { key: 'good', label: 'GOOD', mult: { rareMult: 1.6 }, group: 'manual' },
  { key: 'perfect', label: 'PERFECT', mult: { rareMult: 2.0 }, group: 'manual' },
  { key: 'idleBest', label: '방치×4', mult: { commonMult: 4 }, group: 'idle' },
  { key: 'idleWorst', label: '방치×10', mult: { commonMult: 10 }, group: 'idle' },
] as const satisfies readonly {
  key: string; label: string; mult: DrawOptions; group: 'manual' | 'idle';
}[];

export type AxisKey = typeof SIM_AXES[number]['key'];
export type AxisEvs = Record<AxisKey, number>;
export type SpotDrawRow = DrawRow & { price: number };

/** 단일 수역의 다섯 보상 축 기대값을 시뮬레이션 오버라이드로 계산한다. */
export function selectSpotAxisEvs(spot: SpotId, sim: SimOverrides): AxisEvs {
  return Object.fromEntries(SIM_AXES.map(axis => {
    const rows = drawRows(spot, {
      ...axis.mult,
      budgets: sim.budgets[spot],
      fishWeights: sim.fishWeights[spot],
    });
    let numerator = 0;
    let denominator = 0;
    for (const row of rows) {
      numerator += row.fishPct * (sim.price[row.fish.id] ?? row.fish.price);
      denominator += row.fishPct;
    }
    return [axis.key, denominator > 0 ? numerator / denominator : 0];
  })) as AxisEvs;
}

/** 수역의 낮·밤 어종을 등급 순으로 반환한다. */
export function selectFishForSpot(spot: SpotId, night: boolean): Fish[] {
  return FISH.filter(fish => fish.spot === spot && Boolean(fish.night) === night)
    .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
}

/** 현재 오버라이드를 적용한 어종별 추첨 행을 반환한다. */
export function selectSpotDraws(spot: SpotId, sim: SimOverrides): Map<string, SpotDrawRow> {
  return new Map(drawRows(spot, {
    budgets: sim.budgets[spot],
    fishWeights: sim.fishWeights[spot],
  }).map(row => ({
    ...row,
    price: sim.price[row.fish.id] ?? row.fish.price,
  })).map(row => [row.fish.id, row]));
}

/** 수역 등급의 원본 예산. 샌드박스 오버라이드 입력의 placeholder에 쓴다. */
export function selectBaseRarityWeight(spot: SpotId, rarity: RarityId): number {
  return rarityWeightOf(spot, rarity);
}

/** 수역 초기화 버튼 노출 여부. 가격 오버라이드는 화면에서 편집 가능한 어종만 확인한다. */
export function hasSpotSimulationOverride(
  spot: string, sim: SimOverrides, editableFish: readonly Fish[],
): boolean {
  return Object.keys(sim.budgets[spot] ?? {}).length > 0
    || Object.keys(sim.fishWeights[spot] ?? {}).length > 0
    || editableFish.some(fish => sim.price[fish.id] != null);
}

/** 관리 화면에서 수역 오버라이드를 초기화할 때 사용할 다음 가격 맵을 만든다. */
export function resetSpotPriceOverrides(
  currentPrices: Record<string, number>, editableFish: readonly Fish[],
): Record<string, number> {
  const price = { ...currentPrices };
  for (const fish of editableFish) delete price[fish.id];
  return price;
}

/** 오버라이드가 등록된 필드 수를 센다. */
export function countSimulationOverrides(sim: SimOverrides, spots: readonly Spot[] = SPOTS): number {
  let count = 0;
  for (const spot of spots) {
    count += Object.keys(sim.budgets[spot.id] ?? {}).length;
    count += Object.keys(sim.fishWeights[spot.id] ?? {}).length;
  }
  return count + Object.keys(sim.price).length;
}

/** 이전 값 대비 백분율 변화. */
export function stepPercent(from: number, to: number): number {
  return from !== 0 ? (to - from) / Math.abs(from) * 100 : 0;
}

export function selectDeltaValues(previous: number, current: number) {
  const diff = current - previous;
  return {
    diff,
    percent: previous !== 0 ? stepPercent(previous, current) : null,
    unchanged: Math.abs(diff) <= 0.05,
  };
}

/** 현황 JSON에 넣을 모든 수역·어종·기대값 데이터를 만든다. */
export function buildFishSnapshotExport(
  spots: readonly Spot[], sim: SimOverrides, evsBySpot: ReadonlyMap<string, AxisEvs>,
  exportedAt: string,
) {
  return {
    exportedAt,
    spots: spots.map(spot => ({
      id: spot.id,
      name: spot.name,
      boatTier: spot.boatTier,
      powerReq: spot.powerReq ?? null,
      rarityWeightOverride: spot.rarityWeight ?? null,
      simEV: Object.fromEntries(SIM_AXES.map(axis => [
        axis.key, +((evsBySpot.get(spot.id)?.[axis.key] ?? 0).toFixed(1)),
      ])),
      fish: FISH.filter(fish => fish.spot === spot.id).map(fish => ({
        id: fish.id,
        name: fish.name,
        rarity: fish.rarity,
        price: fish.price,
        sbPrice: sim.price[fish.id] ?? null,
        budgetBase: rarityWeightOf(spot.id as SpotId, fish.rarity),
        sbBudget: sim.budgets[spot.id]?.[fish.rarity] ?? null,
        individualWeight: fish.weight ?? 1,
        sbWeight: sim.fishWeights[spot.id]?.[fish.id] ?? null,
      })),
    })),
    notes: {
      drawModel: '2단 — 등급 예산(수역별 고정, 부재 등급 재균등) × 개체 균등 배분',
      dialAxes: 'commonMult=일반 예산 × / rareMult=일반 예산 ÷ (판정·방치 다이얼)',
      fieldsSbX: 'sb* = 관리자 화면의 미확정 오버라이드. null = 원본 값 사용 중',
      evAxes: `simEV keys = ${SIM_AXES.map(axis => axis.key).join('/')}`,
    },
  };
}

/** 변경된 필드만 담은 JSON. 오버라이드가 없으면 null을 반환한다. */
export function buildFishDeltaExport(
  spots: readonly Spot[], sim: SimOverrides, evsBySpot: ReadonlyMap<string, AxisEvs>,
  exportedAt: string,
) {
  const changedFields = countSimulationOverrides(sim, spots);
  if (changedFields === 0) return null;

  const changedSpots = spots.map(spot => {
    const fish = FISH.filter(row => row.spot === spot.id).flatMap(row => {
      const price = sim.price[row.id] ?? null;
      const weight = sim.fishWeights[spot.id]?.[row.id] ?? null;
      if (price === null && weight === null) return [];
      return [{
        id: row.id,
        name: row.name,
        rarity: row.rarity,
        ...(price !== null ? { price } : {}),
        ...(weight !== null ? { weight } : {}),
      }];
    });
    const budgetDelta = sim.budgets[spot.id];
    const hasBudgetDelta = budgetDelta && Object.keys(budgetDelta).length > 0;
    if (!hasBudgetDelta && fish.length === 0) return [];
    return [{
      id: spot.id,
      name: spot.name,
      ...(hasBudgetDelta ? { rarityWeightDelta: budgetDelta } : {}),
      ...(fish.length > 0 ? { fish } : {}),
      simEV: Object.fromEntries(SIM_AXES.map(axis => [
        axis.key, +((evsBySpot.get(spot.id)?.[axis.key] ?? 0).toFixed(1)),
      ])),
    }];
  }).flat();

  return {
    exportedAt,
    deltaOnly: true,
    changedFields,
    spots: changedSpots,
    notes: {
      usage: 'Δ JSON — sb* ≠ null 인 항목만. 비어 있으면 spots=[]',
      fields: 'rarityWeightDelta = 수역 등급 예산 오버라이드(변경된 등급만), fish[].price/weight = 어종 확정값(변경된 어종만)',
    },
  };
}
