// 사이드바 탭들이 공유하는 상수/타입 — 컴포넌트 파일과 분리해 Fast Refresh 경고 방지
import type { RarityId } from '../game/logic';

/** 도감 보기 — 활성 도감 탭 재클릭으로 전환 */
export type DexView = 'base' | 'variant';

// 등급 오름차순(일반 → 전설) 정렬용
export const RARITY_ORDER: RarityId[] = ['common', 'rare', 'epic', 'legendary'];
export const rarityRank = (r: RarityId) => RARITY_ORDER.indexOf(r);
