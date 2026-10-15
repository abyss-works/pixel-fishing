import SpriteCanvas from './SpriteCanvas';
import { GEAR_PALETTE, ROD_SPRITE } from '../../game/content/sprites/gearSprites.generated';
import { OUTLINE_DARK } from '../../game/content/sprites';

// 장비 스프라이트 — 낚싯대 등 레벨과 무관한 한 그림. 강화 화면 머리(2×)·목록(1×).
const PRESETS = {
  thumb: { w: 32, h: 16, scale: 1 },
  row:   { w: 64, h: 32, scale: 2 },
} as const;
const SPRITES = { rod: ROD_SPRITE } as const;

export default function GearSprite({ kind, preset, ariaLabel, className }: {
  kind: keyof typeof SPRITES; preset: keyof typeof PRESETS; ariaLabel?: string; className?: string;
}) {
  const { w, h, scale } = PRESETS[preset];
  return (
    <SpriteCanvas sprite={SPRITES[kind]} colors={GEAR_PALETTE} scale={scale} w={w} h={h}
                  outline={OUTLINE_DARK} ariaLabel={ariaLabel} className={className} />
  );
}
