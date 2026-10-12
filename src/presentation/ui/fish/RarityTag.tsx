import { RARITY } from '../../../game/content/rarity';
import type { RarityId } from '../../../game/content/rarity';

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

/** 등급 테두리 카드 — 도감 격자·가방 카드뷰·지역 탭 수역 카드가 공유한다.
    같은 문자열을 복붙하면 한쪽만 고쳐지며 갈라진다.
    테두리가 등급의 유일한 표시라 얇으면 안 보인다: 2px + 알파 70%.
    **크기(패딩·글자)는 여기 없다** — 화면마다 카드가 커야 할 이유가 달라 쓰는 쪽이 정한다.
    쓰는 쪽이 `data-rarity`를 걸어야 --rarity-color가 잡힌다. */
export const RARITY_CARD =
  'bg-bg border-2 rounded-sm text-center leading-normal'
  + ' border-[color-mix(in_srgb,var(--rarity-color)_70%,transparent)]'
  + ' transition-[translate,background-color] duration-[120ms] ease-out'
  + ' hover:-translate-y-0.5 hover:bg-surface-2';
