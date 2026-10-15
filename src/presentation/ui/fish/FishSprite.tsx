import { useEffect, useRef } from 'react';
import { drawSpriteCentered } from '../../../game/rendering/pixel';
import { fishColors, fishRings, fishSprite } from '../../../game/content/sprites';
import type { Fish, FormId } from '../../../game/content/fish';
import { cx } from '../cx';

// 용도별 캔버스 크기·배율 프리셋 — 가방 썸네일/도감 카드/도감 상세 초상화/획득 카드.
// 원화 격자는 32×16이고 배율은 정수만(픽셀아트). 격자가 캔버스보다 크면 투명 여백만 잘린다.
const PRESETS = {
  thumb:    { w: 30,  h: 16,  scale: 1 },
  icon:     { w: 84,  h: 44,  scale: 3 },
  portrait: { w: 240, h: 140, scale: 6 },
  card:     { w: 160, h: 90,  scale: 4 },
} as const;

interface FishSpriteProps {
  fish: Fish;
  preset: keyof typeof PRESETS;
  /** 어느 폼으로 그릴지 — 변이는 변이 색을 기준색으로 팔레트를 해석한다 */
  form?: FormId;
  /** false면 실루엣(전 슬롯을 실루엣 색으로, 윤곽 없음) */
  discovered?: boolean;
  /** true면 꼬리 열 흔들기(rAF). 획득 카드·도감 상세·전시대처럼 머무는 화면에서만 켠다 */
  animate?: boolean;
  /** 없으면 장식 취급(aria-hidden) */
  ariaLabel?: string;
  className?: string;
}

// 어종 스프라이트 캔버스 — 격자·팔레트·링 해석은 콘텐츠(fishSprite/fishColors/fishRings),
// 굽기와 찍기는 렌더러(drawSpriteCentered)가 맡는다. jsdom엔 canvas가 없어 ctx null 가드.
// 애니메이션은 한 캔버스당 rAF 하나 — 목록(thumb 수백 개)에서는 켜지 않는다.
export default function FishSprite({
  fish, preset, form = 'normal', discovered = true, animate = false, ariaLabel, className,
}: FishSpriteProps) {
  const { w, h, scale } = PRESETS[preset];
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return; // jsdom
    const sprite = fishSprite(fish, form);
    const colors = fishColors(fish, form, discovered);
    const rings = fishRings(fish, discovered);
    const paint = (t?: number) => {
      ctx.clearRect(0, 0, w, h);
      drawSpriteCentered(ctx, sprite, colors, scale, w / 2, h / 2, { ...rings, t });
    };
    if (!animate) { paint(); return; }
    let raf = 0;
    const loop = (ms: number) => { paint(ms / 1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fish, form, discovered, animate, w, h, scale]);
  return (
    <canvas
      ref={ref} width={w} height={h}
      className={cx('[image-rendering:pixelated]', className)}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : { 'aria-hidden': true })}
    />
  );
}
