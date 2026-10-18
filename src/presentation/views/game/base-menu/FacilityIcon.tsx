import { useEffect, useRef } from 'react';
import { SCALE } from '../../../../game/rendering/pixel/common.js';
import type { Ctx } from '../../../../game/rendering/pixel/common.js';
import type { Rect } from '../../../../game/world';

// 스프라이트의 지붕·돛 같은 장식은 영역 밖으로 나오므로 둘레에 여백을 둔다
const PAD = 8;

/** 영역 기준으로 그리는 픽셀 스프라이트(가구·건물)를 그 영역만 잘라 작은 Canvas에 그린다 */
export default function FacilityIcon({ rect, draw }: { rect: Rect; draw: (ctx: Ctx) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = rect.w + PAD * 2, h = rect.h + PAD * 2;

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w * SCALE, h * SCALE);
    ctx.setTransform(SCALE, 0, 0, SCALE, (PAD - rect.x) * SCALE, (PAD - rect.y) * SCALE);
    draw(ctx);
  }, [rect, draw, w, h]);

  return (
    <canvas ref={ref} width={w * SCALE} height={h * SCALE} aria-hidden="true"
            className="block h-full w-full object-contain [image-rendering:pixelated]" />
  );
}
