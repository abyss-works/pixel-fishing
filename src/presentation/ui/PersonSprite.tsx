import { useEffect, useRef } from 'react';
import { drawBoat, drawHead, drawPerson } from '../../game/rendering/pixel/sprites/actors';
import type { Look } from '../../game/content/wardrobe';
import { cx } from './cx';

// 사람 그림 캔버스 — 외형(Look)을 필드와 같은 그림 함수로 그린다. onBoat면 필드의 쪽배 위에 선 모습이고,
// headOnly면 모자를 쓴 머리만 그린다(업적 보상 칸). 캔버스 크기는 그림 단위(사람 16x22, 배 위 26x30, 머리 12x10)에 정수 배율을 곱한 값이다.
const UNITS = {
  person: { w: 16, h: 22, x: 7, y: 21 },
  boat: { w: 26, h: 30, x: 13, y: 23 },
  head: { w: 12, h: 10, x: 6, y: 10 },
} as const;

export default function PersonSprite({ look, scale, onBoat = false, headOnly = false, ariaLabel, className }: {
  look: Look;
  /** 정수 배율(픽셀아트) */
  scale: number;
  onBoat?: boolean;
  /** 모자를 쓴 머리만 그린다 — onBoat와 함께 쓰지 않는다 */
  headOnly?: boolean;
  /** 없으면 장식 취급(aria-hidden) */
  ariaLabel?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const u = headOnly ? UNITS.head : onBoat ? UNITS.boat : UNITS.person;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return; // jsdom
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, u.w * scale, u.h * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (headOnly) drawHead(ctx, u.x, u.y, look);
    else if (onBoat) drawBoat(ctx, u.x, u.y, 0, look);
    else drawPerson(ctx, u.x, u.y, look);
  }, [look, scale, onBoat, headOnly, u]);
  return (
    <canvas ref={ref} width={u.w * scale} height={u.h * scale}
            className={cx('block [image-rendering:pixelated]', className)}
            {...(ariaLabel ? { 'aria-label': ariaLabel, role: 'img' } : { 'aria-hidden': true })} />
  );
}
