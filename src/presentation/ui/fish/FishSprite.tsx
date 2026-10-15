import { useEffect, useRef } from 'react';
import { fishArt } from '../../../game/rendering/pixel/fishArt';
import type { FishArtStyle } from '../../../game/rendering/pixel/fishArt';
import type { Fish, FormId } from '../../../game/content/fish';
import { useFishArtStyle } from '../../../features/display/service/fishArtStyle';
import { cx } from '../cx';

// 용도별 캔버스 크기·배율 프리셋 — 가방 썸네일/도감 카드/도감 상세 초상화/획득 카드.
// 배율은 정수만(픽셀아트). 그림이 캔버스보다 크면 투명 여백만 잘린다.
const PRESETS = {
  thumb:    { w: 30,  h: 16,  scale: 1 },
  icon:     { w: 84,  h: 44,  scale: 3 },
  portrait: { w: 240, h: 140, scale: 6 },
  card:     { w: 160, h: 90,  scale: 4 },
} as const;

interface FishSpriteProps {
  fish: Fish;
  preset: keyof typeof PRESETS;
  /** 어느 폼으로 그릴지 */
  form?: FormId;
  /** false면 실루엣 */
  discovered?: boolean;
  /** true면 유영 흔들기(rAF) — 획득 카드·도감 상세·전시대처럼 머무는 화면에서만 켠다.
   *  움직임을 지원하지 않는 그림체(v1)에서는 정지 화면이다 */
  animate?: boolean;
  /** 설정과 무관하게 이 그림체로 그린다 — 그림체를 고르는 화면의 미리보기 전용 */
  artStyle?: FishArtStyle;
  /** 없으면 장식 취급(aria-hidden) */
  ariaLabel?: string;
  className?: string;
}

// 어종 스프라이트 캔버스 — 무엇을 어떻게 그릴지는 설정에서 고른 물고기 그래픽 어댑터가 정한다.
// jsdom엔 canvas가 없어 ctx null 가드. 애니메이션은 한 캔버스당 rAF 하나.
export default function FishSprite({
  fish, preset, form = 'normal', discovered = true, animate = false, artStyle, ariaLabel, className,
}: FishSpriteProps) {
  const { w, h, scale } = PRESETS[preset];
  const chosen = useFishArtStyle();
  const art = fishArt(artStyle ?? chosen);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return; // jsdom
    const paint = (t?: number) => {
      ctx.clearRect(0, 0, w, h);
      art.drawCentered(ctx, fish, w / 2, h / 2, { scale, form, discovered, t });
    };
    if (!animate || !art.motion) { paint(); return; }
    let raf = 0;
    const loop = (ms: number) => { paint(ms / 1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [art, fish, form, discovered, animate, w, h, scale]);
  return (
    <canvas
      ref={ref} width={w} height={h}
      className={cx('[image-rendering:pixelated]', className)}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : { 'aria-hidden': true })}
    />
  );
}
