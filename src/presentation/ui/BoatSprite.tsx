import SpriteCanvas from './SpriteCanvas';
import { cx } from './cx';
import { BOAT_PALETTE, BOAT_SPRITES } from '../../game/content/sprites/boatSprites.generated';
import { OUTLINE_DARK } from '../../game/content/sprites/common';
import { SPRITE_TARGETS } from '../../game/content/sprites/targets';

// 배 스프라이트 — 단계(tier)별 격자. 구매 사다리 행(2×)·목록 썸네일(1×).
const PRESETS = SPRITE_TARGETS.boat.layout.presets;

export default function BoatSprite({ tier, preset, ariaLabel, className }: {
  tier: number; preset: keyof typeof PRESETS; ariaLabel?: string; className?: string;
}) {
  const sprite = BOAT_SPRITES[tier];
  const { w, h, scale } = PRESETS[preset];
  // 그림이 아직 없는 단계는 목록 정렬이 흔들리지 않게 같은 크기의 빈 자리만 둔다
  if (!sprite) return <span aria-hidden="true" className={cx('inline-block', className)} style={{ width: w, height: h }} />;
  return (
    <SpriteCanvas sprite={sprite} colors={BOAT_PALETTE} scale={scale} w={w} h={h}
                  outline={OUTLINE_DARK} ariaLabel={ariaLabel} className={className} />
  );
}
