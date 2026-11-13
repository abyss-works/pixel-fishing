import SpriteCanvas from './SpriteCanvas';
import { BOAT_PALETTE, BOAT_SPRITES } from '../../game/content/sprites/boatSprites.generated';
import { OUTLINE_DARK } from '../../game/content/sprites/common';
import { SPRITE_TARGETS } from '../../game/content/sprites/targets';

// 배 스프라이트 — 단계(tier 1~6)별 격자. 구매 사다리 행(2×)·목록 썸네일(1×).
const PRESETS = SPRITE_TARGETS.boat.layout.presets;

export default function BoatSprite({ tier, preset, ariaLabel, className }: {
  tier: number; preset: keyof typeof PRESETS; ariaLabel?: string; className?: string;
}) {
  const sprite = BOAT_SPRITES[tier];
  if (!sprite) return null;
  const { w, h, scale } = PRESETS[preset];
  return (
    <SpriteCanvas sprite={sprite} colors={BOAT_PALETTE} scale={scale} w={w} h={h}
                  outline={OUTLINE_DARK} ariaLabel={ariaLabel} className={className} />
  );
}
