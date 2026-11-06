import { useEffect, useRef } from 'react';
import { drawBoat, drawPerson } from '../../game/rendering/pixel/sprites/actors';
import type { Look } from '../../game/content/wardrobe';
import { cx } from './cx';

// 사람 그림 캔버스 — 외형(Look)을 필드와 같은 그림 함수로 그린다. onBoat면 필드의 쪽배 위에 선 모습이다.
// 캔버스 크기는 그림 단위(사람 16x22, 배 위 26x30)에 정수 배율을 곱한 값이다.
const UNITS = {
  person: { w: 16, h: 22, x: 7, y: 21 },
  boat: { w: 26, h: 30, x: 13, y: 23 },
} as const;

export default function PersonSprite({ look, scale, onBoat = false, ariaLabel, className }: {
  look: Look;
  /** 정수 배율(픽셀아트) */
  scale: number;
  onBoat?: boolean;
  /** 없으면 장식 취급(aria-hidden) */
  ariaLabel?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const u = onBoat ? UNITS.boat : UNITS.person;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return; // jsdom
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, u.w * scale, u.h * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (onBoat) drawBoat(ctx, u.x, u.y, 0, look);
    else drawPerson(ctx, u.x, u.y, look);
  }, [look, scale, onBoat, u]);
  return (
    <canvas ref={ref} width={u.w * scale} height={u.h * scale}
            className={cx('block [image-rendering:pixelated]', className)}
            {...(ariaLabel ? { 'aria-label': ariaLabel, role: 'img' } : { 'aria-hidden': true })} />
  );
}
