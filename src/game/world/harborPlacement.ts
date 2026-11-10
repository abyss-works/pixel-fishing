// 항구 배치 규칙 — 항구마다 기준점(해안선 위 한 점)과 바다 방향만 정하고,
// 건물·부두·접안 자리·출항 자리는 이 한 함수가 같은 규칙으로 계산한다.
import type { Point, Rect } from './types';

export type SeaFacing = 'north' | 'south' | 'east' | 'west';

const HARBOR_BUILDING_SIZE = { w: 36, h: 28 };
const DOCK_LENGTH = 16;
const DOCK_WIDTH = 8;
const BERTH_SIZE = 16;
/** 접안 자리 중심에서 바다 방향으로 출항 자리까지의 거리 */
export const DEPARTURE_DIST = 24;

export interface HarborPlacement {
  facing: SeaFacing;
  anchor: Point;
  building: Rect;
  dock: Rect;
  /** 접안 트리거 — 부두 끝의 물 위 */
  berth: Rect;
  /** 출항 자리(승선·빠른 이동 도착) — 접안 자리 바로 앞 물 위 */
  departure: Point;
  /** 건물 그림의 좌우 반전 — 부두 쪽 요소(크레인)가 서쪽 바다를 향하게 한다 */
  flip: boolean;
}

export const SEA_VECTOR: Record<SeaFacing, Point> = {
  north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 },
};

export function isSeaFacing(v: unknown): v is SeaFacing {
  return typeof v === 'string' && v in SEA_VECTOR;
}

const around = (c: Point, w: number, h: number): Rect => ({ x: c.x - w / 2, y: c.y - h / 2, w, h });

export function placeHarbor(anchor: Point, facing: SeaFacing): HarborPlacement {
  const u = SEA_VECTOR[facing];
  const horizontal = u.y === 0;
  const along = (d: number): Point => ({ x: anchor.x + u.x * d, y: anchor.y + u.y * d });
  const { w: bw, h: bh } = HARBOR_BUILDING_SIZE;
  const berthCenter = along(DOCK_LENGTH + BERTH_SIZE / 2);
  return {
    facing,
    anchor,
    building: around(along(-(horizontal ? bw : bh) / 2), bw, bh),
    dock: around(along(DOCK_LENGTH / 2), horizontal ? DOCK_LENGTH : DOCK_WIDTH, horizontal ? DOCK_WIDTH : DOCK_LENGTH),
    berth: around(berthCenter, BERTH_SIZE, BERTH_SIZE),
    departure: { x: berthCenter.x + u.x * DEPARTURE_DIST, y: berthCenter.y + u.y * DEPARTURE_DIST },
    flip: facing === 'west',
  };
}
