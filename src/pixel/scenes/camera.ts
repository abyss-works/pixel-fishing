// 카메라 — 플레이어 중심, 월드 경계 클램프 (계층: 컴포지터 보조)
import { W, H } from '../common.js';
import type { Point } from '../../world/types';

export function cameraFor(p: Point, worldW: number, worldH: number): Point {
  return {
    x: Math.max(0, Math.min(p.x - W / 2, worldW - W)),
    y: Math.max(0, Math.min(p.y - H / 2, worldH - H)),
  };
}
