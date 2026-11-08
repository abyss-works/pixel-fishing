// 카메라 — 플레이어 중심, 월드 경계 클램프 (계층: 컴포지터 보조)
import type { Point, Rect } from '../../../world/types';
import type { ViewSize } from '../../../world/fieldView';

/** 카메라 위치(시야 서북 모서리) — 플레이어가 시야 가운데에 오되 bounds 밖으로 나가지 않는다 */
export function cameraFor(p: Point, bounds: Rect, view: ViewSize): Point {
  return {
    x: Math.max(bounds.x, Math.min(p.x - view.w / 2, bounds.x + bounds.w - view.w)),
    y: Math.max(bounds.y, Math.min(p.y - view.h / 2, bounds.y + bounds.h - view.h)),
  };
}
