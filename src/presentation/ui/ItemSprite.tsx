import SpriteCanvas from './SpriteCanvas';
import type { CookKind } from '../../game/content/cooking';
import { OUTLINE_DARK } from '../../game/content/sprites/common';
import { itemSprite } from '../../game/content/sprites/itemSprites';
import { SPRITE_TARGETS } from '../../game/content/sprites/targets';

// 요리 스프라이트 — 도시락(요리 대상)과 미끼(미끼 대상). 한 줄로 나열하는 자리(1×)·부엌 창 레시피 목록(2×)·부엌 창 상세 머리(3×).
// 두 대상은 같은 격자와 프리셋을 쓰므로 호출자는 레시피 종류와 id만 넘긴다.
const TARGETS = { lunch: SPRITE_TARGETS.dish, bait: SPRITE_TARGETS.bait } as const;
type Preset = keyof typeof SPRITE_TARGETS.dish.layout.presets;

export default function ItemSprite({ kind, id, preset, ariaLabel, className }: {
  kind: CookKind; id: string; preset: Preset; ariaLabel?: string; className?: string;
}) {
  const art = itemSprite(kind, id);
  if (!art) return null;
  const { w, h, scale } = TARGETS[kind].layout.presets[preset];
  return (
    <SpriteCanvas sprite={art.sprite} colors={art.colors} scale={scale} w={w} h={h}
                  outline={OUTLINE_DARK} ariaLabel={ariaLabel} className={className} />
  );
}
