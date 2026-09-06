// 카메라 — 플레이어 중심, 월드 경계 클램프 (계층: 컴포지터 보조)
import { FIELD_W, FIELD_H } from '../common.js';
import type { Point } from '../../world/types';

export function cameraFor(p: Point, worldW: number, worldH: number): Point {
  return {
    x: Math.max(0, Math.min(p.x - FIELD_W / 2, worldW - FIELD_W)),
    y: Math.max(0, Math.min(p.y - FIELD_H / 2, worldH - FIELD_H)),
  };
}
