import { useEffect, useRef } from 'react';
import { drawSpriteCentered } from '../../game/rendering/pixel';
import type { PixelSprite } from '../../game/content/sprites';
import { cx } from './cx';

interface SpriteCanvasProps {
  sprite: PixelSprite;
  colors: readonly string[];
  /** 정수 배율(픽셀아트) */
  scale: number;
  /** 캔버스 크기 — 격자보다 작으면 투명 여백만 잘린다 */
  w: number;
  h: number;
  outline?: string;
  /** true면 유영 흔들기(rAF) — 머무는 화면에서만 */
  animate?: boolean;
  /** 없으면 장식 취급(aria-hidden) */
  ariaLabel?: string;
  className?: string;
}

// 격자 스프라이트 캔버스 호스트 — 배·낚싯대 같은 격자 스프라이트의 DOM 생명주기를 한 곳에서 맡는다.
// 어떤 격자·색을 그릴지는 호출자가 콘텐츠에서 해석해 넘긴다. 물고기는 그래픽 어댑터를 거치므로 쓰지 않는다.
// jsdom엔 canvas가 없어 ctx null 가드. 애니메이션은 한 캔버스당 rAF 하나.
export default function SpriteCanvas({
  sprite, colors, scale, w, h, outline, animate = false, ariaLabel, className,
}: SpriteCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return; // jsdom
    const paint = (t?: number) => {
      ctx.clearRect(0, 0, w, h);
      drawSpriteCentered(ctx, sprite, colors, scale, w / 2, h / 2, { outline, t });
    };
    if (!animate) { paint(); return; }
    let raf = 0;
    const loop = (ms: number) => { paint(ms / 1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sprite, colors, scale, w, h, outline, animate]);
  return (
    <canvas
      ref={ref} width={w} height={h}
      className={cx('[image-rendering:pixelated]', className)}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : { 'aria-hidden': true })}
    />
  );
}
