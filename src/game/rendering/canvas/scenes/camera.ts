// 카메라 — 플레이어 중심, 월드 경계 클램프 (계층: 컴포지터 보조)
import type { Point } from '../../../world/types';
import type { ViewSize } from '../../../world/fieldView';

export function cameraFor(p: Point, worldW: number, worldH: number, view: ViewSize): Point {
  return {
    x: Math.max(0, Math.min(p.x - view.w / 2, worldW - view.w)),
    y: Math.max(0, Math.min(p.y - view.h / 2, worldH - view.h)),
  };
}
