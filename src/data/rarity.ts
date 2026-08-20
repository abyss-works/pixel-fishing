// 등급 데이터 — 가중치·명성·표기색 
export interface Rarity {
  name: string;
  color: string;
  weight: number;
  fame: number; // 어획 시 획득 명성 (무한 누적, 소모 없음)
}

const DATA = {
  common:    { name: '일반', color: '#b8c2cc', weight: 74, fame: 5 },
  rare:      { name: '희귀', color: '#4fc3f7', weight: 20, fame: 15 },
  epic:      { name: '영웅', color: '#ba68c8', weight: 5,  fame: 40 },
  legendary: { name: '전설', color: '#ffd54f', weight: 1,  fame: 100 },
} as const satisfies Record<string, Rarity>;

export type RarityId = keyof typeof DATA;
export const RARITY: Record<RarityId, Rarity> = DATA;
