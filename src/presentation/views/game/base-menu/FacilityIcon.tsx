import { useEffect, useRef } from 'react';
import { FURNITURE_SPRITES } from '../../../../game/rendering/pixel/sprites/buildings.js';
import { SCALE } from '../../../../game/rendering/pixel/common.js';
import type { Furniture } from '../../../../game/world';

// 스프라이트의 지붕·돛 같은 장식은 시설 영역 밖으로 나오므로 둘레에 여백을 둔다
const PAD = 8;

/** 거점 가구 스프라이트를 시설 영역 기준으로 잘라 작은 Canvas에 그린다 */
export default function FacilityIcon({ facility }: { facility: Furniture }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = facility.w + PAD * 2, h = facility.h + PAD * 2;

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w * SCALE, h * SCALE);
    ctx.setTransform(SCALE, 0, 0, SCALE, (PAD - facility.x) * SCALE, (PAD - facility.y) * SCALE);
    FURNITURE_SPRITES[facility.sprite](ctx, facility);
  }, [facility, w, h]);

  return (
    <canvas ref={ref} width={w * SCALE} height={h * SCALE} aria-hidden="true"
            className="block h-full w-full object-contain [image-rendering:pixelated]" />
  );
}
