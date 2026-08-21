import { RARITY } from '../data/rarity';
import type { RarityId } from '../data/rarity';

// 등급 텍스트 — data-rarity 속성으로 색 지정 (index.css [data-rarity] → --rarity-color)
export function RarityText({ rarity }: { rarity: RarityId }) {
  return <span data-rarity={rarity} className="text-(--rarity-color)">{RARITY[rarity].name}</span>;
}

// 미획득 도감 카드용 등급 점 
export function RarityDot({ rarity }: { rarity: RarityId }) {
  return (
    <span
      data-rarity={rarity}
      className="inline-block size-1.5 rounded-full mr-1 align-middle bg-(--rarity-color)"
    />
  );
}
