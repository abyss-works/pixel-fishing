// 수역 데이터 — 새 수역 추가 시 여기 행 추가만으로 SpotId까지 자동 확장
// boatTier 0 = 배 없이 가능(마을), 1+ = 대양(배 필요). region = 소속 지역(도감 계층·지역 탭 분류)
// powerReq = 낚싯대 파워 요구량(stats.rodPower, **10단위 스냅** — 사용자 지시). 미달이면 그
// 수역에서 존이 사라지고 일반 가중치·입질 시간 페널티를 받는다(stats.powerZones 참조).
// rarityWeight = 등급 예산 수역 오버라이드 — 지역 간 등급 분포 차등용(미기재 등급은 글로벌 표).
import type { RarityId } from './rarity.js';
import { RARITY } from './rarity.js';

const DATA = [
  { id: 'pond',  name: '마을 연못',     boatTier: 0, region: 'village', powerReq: 10 }, // Lv1
  { id: 'river', name: '마을 강',       boatTier: 0, region: 'village', powerReq: 20 }, // Lv3
  { id: 'sea',   name: '태평양',        boatTier: 1, region: 'ocean', powerReq: 35 }, // Lv6
  { id: 'deep',  name: '마리아나 해구', boatTier: 2, region: 'ocean', powerReq: 40 }, // Lv7
  // 동남아&오세아니아 — 일반 수역 없이 특화 3수역(군집은 특화에만 둔다)
  { id: 'dragonhole',  name: '드래곤 홀',         boatTier: 3, region: 'seasia', powerReq: 55 }, // Lv10
  { id: 'coron',       name: '코론 침선 지대',    boatTier: 3, region: 'seasia', powerReq: 60,
    rarityWeight: { rare: 28, epic: 11 } },   // 사용자 지정 수역 밸런스 (2026-08-26)
  { id: 'barrierreef', name: '그레이트 배리어 리프', boatTier: 3, region: 'seasia', powerReq: 65,
    rarityWeight: { common: 35, rare: 15, legendary: 2 } }, // 최종 콘텐츠 — 사용자 지정 수역 밸런스
  // 1-3 인도양 — 지역당 수역 2개 원칙(일반 연안 + 특화) 복귀. powerReq는 +5 사다리(사용자 직전 튜닝 관례).
  { id: 'indian',      name: '인도양',       boatTier: 4, region: 'indian', powerReq: 70 }, // Lv13
  { id: 'southindian', name: '남인도양',     boatTier: 4, region: 'indian', powerReq: 75 }, // Lv14
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
