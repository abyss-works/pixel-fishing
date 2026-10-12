// 등급 데이터 — 가중치·명성·표기색·획득 연출 
// 등급 추가(6등급 개편) = 여기 행 추가 + index.css 등급색 토큰 1줄.
// order로 정렬·연출이 파생되므로 코드 쪽 등급 목록 하드코딩이 없다.
export interface Rarity {
  name: string;
  color: string;
  weight: number;
  fame: number;      // 어획 시 획득 명성 (무한 누적, 소모 없음)
  order: number;     // 오름차순 = 흔함 → 귀함 (도감/가방 정렬 기준)
  sparks: number;    // 획득 카드 방사형 스파크 수 (0 = 없음)
  sparkDist: number; // 스파크 비행 거리(px) 기준값
  halo: boolean;     // 최고급 연출 (궤도 링 + 긴 스파크) — 획득 표시 시간도 이 플래그로 연장
}

const DATA = {
  common:    { name: '일반', color: '#b8c2cc', weight: 74, fame: 5,   order: 0, sparks: 0,  sparkDist: 0,   halo: false },
  rare:      { name: '희귀', color: '#4fc3f7', weight: 20, fame: 15,  order: 1, sparks: 0,  sparkDist: 0,   halo: false },
  epic:      { name: '영웅', color: '#ba68c8', weight: 5,  fame: 40,  order: 2, sparks: 12, sparkDist: 70,  halo: false },
  legendary: { name: '전설', color: '#ffd54f', weight: 1,  fame: 100, order: 3, sparks: 20, sparkDist: 110, halo: true },
} as const satisfies Record<string, Rarity>;

export type RarityId = keyof typeof DATA;
export const RARITY: Record<RarityId, Rarity> = DATA;

// 등급 오름차순(일반 → 전설) — order 필드에서 파생, 수동 배열 금지
export const RARITY_ORDER: RarityId[] =
  (Object.keys(DATA) as RarityId[]).sort((a, b) => DATA[a].order - DATA[b].order);
export const rarityRank = (r: RarityId): number => RARITY[r].order;
