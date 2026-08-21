import { useEffect, useRef } from 'react';
import { drawFishSprite } from '../pixel';
import type { Fish } from '../data/fish';
import { cx } from './cx';

// 용도별 캔버스 크기·스케일 프리셋 — 가방 썸네일/도감 카드/도감 상세 초상화/획득 카드
const PRESETS = {
  thumb:    { w: 30,  h: 16,  scale: 1 },
  icon:     { w: 84,  h: 44,  scale: 3 },
  portrait: { w: 240, h: 140, scale: 6 },
  card:     { w: 160, h: 90,  scale: 4 },
} as const;

// 미발견 실루엣 색 — 몸 형태만 보여주고 색은 숨긴다 (도감 스포일러 규칙)
const SILHOUETTE = '#22314a';

interface FishSpriteProps {
  fish: Fish;
  preset: keyof typeof PRESETS;
  /** 변이 폼이면 변이 색으로 그린다 */
  mutated?: boolean;
  /** false면 실루엣(색·디테일 숨김) */
  discovered?: boolean;
  /** 없으면 장식 취급(aria-hidden) */
  ariaLabel?: string;
  className?: string;
}

// 어종 스프라이트 캔버스 — 구 FishThumb/FishIcon/DexPortrait/CatchSprite 4벌 통합 (같은
// ref+useEffect+drawFishSprite 패턴의 복붙이었다). jsdom엔 canvas가 없어 ctx null 가드.
export default function FishSprite({
  fish, preset, mutated = false, discovered = true, ariaLabel, className,
}: FishSpriteProps) {
  const { w, h, scale } = PRESETS[preset];
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return; // jsdom
    ctx.clearRect(0, 0, w, h);
    const color = discovered ? (mutated ? fish.variant.color : fish.color) : SILHOUETTE;
    drawFishSprite(ctx, w / 2, h / 2, fish.shape, color, scale, discovered);
  }, [fish, mutated, discovered, w, h, scale]);
  return (
    <canvas
      ref={ref} width={w} height={h}
      className={cx('[image-rendering:pixelated]', className)}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : { 'aria-hidden': true })}
    />
  );
}
