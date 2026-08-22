// 사이드바 탭들이 공유하는 상수/타입 — 컴포넌트 파일과 분리해 Fast Refresh 경고 방지
// 등급 정렬은 데이터(data/rarity의 order 필드)에서 파생 — 여기선 재수출만.
export { RARITY_ORDER, rarityRank } from '../data/rarity';

/** 도감 보기 — 활성 도감 탭 재클릭으로 전환 */
export type DexView = 'base' | 'variant';
