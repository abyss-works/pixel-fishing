import { RARITY } from '../logic';
import type { RarityId } from '../logic';

// 등급 텍스트 — data-rarity 속성으로 색 지정(인라인 style 금지, index.css [data-rarity] 참조)
export function RarityText({ rarity }: { rarity: RarityId }) {
  return <span data-rarity={rarity} className="rarity-text">{RARITY[rarity].name}</span>;
}

// 미획득 도감 카드용 등급 점 
export function RarityDot({ rarity }: { rarity: RarityId }) {
  return <span data-rarity={rarity} className="rarity-dot" />;
}
