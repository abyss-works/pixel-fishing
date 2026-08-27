// 수역 데이터 — 새 수역 추가 시 여기 행 추가만으로 SpotId까지 자동 확장
// boatTier 0 = 배 없이 가능(마을), 1+ = 대양(배 필요). region = 소속 지역(도감 계층·지역 탭 분류)
// powerReq = 낚싯대 파워 요구량(stats.rodPower). 1-3부터는 **Lv 단위로 지정해 stats.powerOfLevel
// 로 환산**하는 관례가 시작됐다(기존 행은 파워 리터럴 — 스케일 혼재는 status.md ⬜). 미달이면 그
// 수역에서 존이 사라지고 일반 가중치·입질 시간 페널티를 받는다(stats.powerZones 참조).
// rarityWeight = 등급 예산 수역 오버라이드 — 지역 간 등급 분포 차등용(미기재 등급은 글로벌 표).
import type { RarityId } from './rarity.js';
import { RARITY } from './rarity.js';
import { powerOfLevel } from '../game/stats.js';

const DATA = [
  { id: 'pond',  name: '마을 연못',     boatTier: 0, region: 'village', powerReq: 10 }, // Lv1
  { id: 'river', name: '마을 강',       boatTier: 0, region: 'village', powerReq: 20 }, // Lv3
  { id: 'sea',   name: '태평양',        boatTier: 1, region: 'ocean', powerReq: 35 }, // Lv6
  { id: 'deep',  name: '마리아나 해구', boatTier: 2, region: 'ocean', powerReq: 40 }, // Lv7
  // 동남아&오세아니아 — 일반 수역 없이 특화 3수역(군집은 특화에만 둔다)
  { id: 'dragonhole',  name: '드래곤 홀',         boatTier: 3, region: 'seasia', powerReq: 55 }, // Lv10
  { id: 'coron',       name: '코론 침선 지대',    boatTier: 3, region: 'seasia', powerReq: 60,
    rarityWeight: { rare: 20, epic: 9, common: 70 } },   // 사용자 밸런스 일괄 (2026-08-27 JSON)
  { id: 'barrierreef', name: '그레이트 배리어 리프', boatTier: 3, region: 'seasia', powerReq: 65,
    rarityWeight: { common: 74, rare: 23, legendary: 3 } }, // 최종 콘텐츠 — 사용자 밸런스 일괄 (2026-08-27 JSON)
  // 1-3 인도양 — 지역당 수역 2개 원칙(일반 연안 + 특화) 복귀. powerReq는 사용자 확정
  // (2026-08-27): **낚싯대 Lv 단위**로 지정 — Lv16/17 → powerOfLevel로 환산한 파워.
  // 배 게이트: 사용자 확정(2026-08-27) — 1-2 동남아를 **건너뛰고** 인도양으로 넘어가려면
  // tier5(대양선)가 필요하다. 즉 1-2의 말라카 트리거는 requiredBoat 4에서 5로 올라야 하고,
  // 인도양 연안은 tier5 소비 · 남인도양은 tier6 소비다("같은 배로 오래 머물러도 무방" —
  // 여러 해역을 한 번에 탐험하는 느낌).
  // 오버라이드: common 중심 파밍 유지, 인도양은 rare 비중 확대 / 남인도양은 rare·epic 특화.
  { id: 'indian',      name: '인도양',       boatTier: 5, region: 'indian',
    powerReq: powerOfLevel(16),   // = 85
    rarityWeight: { common: 164, rare: 27, epic: 8 } },
  { id: 'southindian', name: '남인도양',     boatTier: 6, region: 'indian',
    powerReq: powerOfLevel(17),   // = 90
    rarityWeight: { common: 144, rare: 28, epic: 15 } }, // sbBudget 반영(40→28)
] as const;

export type SpotId = (typeof DATA)[number]['id'];
export type SpotRegionId = (typeof DATA)[number]['region'];

export interface Spot {
  id: SpotId;
  name: string;
  boatTier: number;
  region: SpotRegionId;
  /** 낚싯대 파워 요구량 — 생략 시 제한 없음. 미달 페널티는 stats.powerGate 참조 */
  powerReq?: number;
  /** 등급 예산 수역 오버라이드 — 생략한 등급은 글로벌 가중치(rarity.ts)를 따른다 */
  rarityWeight?: Partial<Record<RarityId, number>>;
}

export const SPOTS: readonly Spot[] = DATA;

/** id → 수역 행. 없는 id는 undefined (호출부 계약상 정상 클라이언트에선 나오지 않는다) */
export const spotById = (id: SpotId): Spot | undefined => SPOTS.find(s => s.id === id);

/** 수역 요구 파워 — 미기재는 0(제한 없음). stats·actions의 게이트 판단이 이 단일 출처를 본다 */
export const powerReqOf = (id: SpotId): number => spotById(id)?.powerReq ?? 0;

/** 수역별 등급 예산 — 오버라이드 → 글로벌 순. rollFish·drawRows의 단일 출처 */
export const rarityWeightOf = (spotId: SpotId, rarity: RarityId): number =>
  spotById(spotId)?.rarityWeight?.[rarity] ?? RARITY[rarity].weight;
