// 등급 가중치 — 만분율(합 10000). 데이터에는 희귀·영웅·전설만 적고 일반은 나머지로 계산한다.
// 덮어쓰기가 없는 해역은 소속 지역이 가장 최근 지역에서 몇 단계 전인지에 따라 프리셋을 쓴다.
import type { RarityId } from './rarity.js';
import { SPOTS } from './spots.js';
import type { SpotId } from './spots.js';
import { ZONE_IDS, topZoneOfSpot } from './zones.js';

export const RARITY_TOTAL = 10000;

/** 일반을 제외한 등급의 만분율 */
export type RarityPermyriad = Record<Exclude<RarityId, 'common'>, number>;

export const RARITY_PRESETS = {
  latest:   { rare: 2000, epic: 300, legendary: 20 },
  previous: { rare: 2000, epic: 400, legendary: 60 },
  stable:   { rare: 2000, epic: 500, legendary: 100 },
} as const satisfies Record<string, RarityPermyriad>;

type RarityPresetStage = keyof typeof RARITY_PRESETS;

/** 지역 위치(0부터)와 지역 수로 프리셋 단계를 정한다 — 0=최신, 1=한 단계 이전, 2 이상=안정화 */
function presetStageOf(zoneIndex: number, zoneCount: number): RarityPresetStage {
  const behind = zoneCount - 1 - zoneIndex;
  return behind <= 0 ? 'latest' : behind === 1 ? 'previous' : 'stable';
}

const fillCommon = (p: RarityPermyriad): Record<RarityId, number> =>
  ({ common: RARITY_TOTAL - p.rare - p.epic - p.legendary, ...p });

function presetOfSpot(spotId: SpotId): RarityPermyriad {
  const zone = topZoneOfSpot(spotId);
  const idx = zone ? ZONE_IDS.indexOf(zone) : -1;
  if (idx < 0) throw new Error(`수역 ${spotId}의 소속 지역을 지역 목록에서 찾을 수 없습니다`);
  return RARITY_PRESETS[presetStageOf(idx, ZONE_IDS.length)];
}

/** 수역의 등급 가중치 전체(합 10000) — 덮어쓰기 → 지역 단계 프리셋 순 */
export function rarityWeightsOf(spotId: SpotId): Record<RarityId, number> {
  const spot = SPOTS.find(s => s.id === spotId);
  if (!spot) throw new Error(`알 수 없는 수역: ${spotId}`);
  return fillCommon(spot.rarityWeight ?? presetOfSpot(spotId));
}

/** 수역별 등급 가중치 — rollFish·drawRows의 단일 출처 */
export const rarityWeightOf = (spotId: SpotId, rarity: RarityId): number => rarityWeightsOf(spotId)[rarity];

/** 전역 기본 등급 확률 — 안정화 프리셋 기준 */
export const stableRarityShare = (rarity: RarityId): number =>
  fillCommon(RARITY_PRESETS.stable)[rarity] / RARITY_TOTAL;
