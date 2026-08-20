// 바다 오픈월드: 지도/섬 충돌/군집 배치/선착장/가구 — 순수 모듈 (R4, R4b, R5)
import type { SpotId } from './logic';

export const WORLD_W = 640, WORLD_H = 360;
export const VIEW_W = 320, VIEW_H = 180;

export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

const inRect = (x: number, y: number, r: Rect) =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

// 해역 4분할  — 전체 지도가 바다
export const ZONES: (Rect & { spot: SpotId })[] = [
  { spot: 'pond',  x: 0,   y: 0,   w: 220, h: 180 },
  { spot: 'river', x: 220, y: 0,   w: 420, h: 180 },
  { spot: 'sea',   x: 0,   y: 180, w: 440, h: 180 },
  { spot: 'deep',  x: 440, y: 180, w: 200, h: 180 },
];

export function zoneAt(x: number, y: number): SpotId {
  for (const z of ZONES) if (inRect(x, y, z)) return z.spot;
  return 'deep'; // 경계 밖 보정 (도달 불가)
}

// 집 섬 + 장애물 섬
export const HOME_ISLAND: Rect = { x: 30, y: 30, w: 80, h: 60 };
export const HOUSE: Rect = { x: 44, y: 36, w: 44, h: 34 };       // 섬 위 작은 집(장식)
export const DOCK: Rect = { x: 58, y: 90, w: 24, h: 14 };        // 선착장(귀항 트리거, 물 위)
export const SPAWN: Point = { x: 70, y: 114 };                   // 출항 위치(트리거 밖)

export const ISLANDS: Rect[] = [
  { x: 170, y: 40,  w: 50, h: 28 },
  { x: 300, y: 90,  w: 44, h: 30 },
  { x: 470, y: 40,  w: 55, h: 30 },
  { x: 120, y: 200, w: 45, h: 28 },
  { x: 300, y: 230, w: 50, h: 32 },
  { x: 560, y: 120, w: 40, h: 36 },
  { x: 200, y: 300, w: 55, h: 26 },
  { x: 480, y: 290, w: 45, h: 30 },
];

export interface School { id: string; spot: SpotId; x: number; y: number }

export const CAST_RANGE = 28; // 군집 "위"에 올라가야 캐스팅 가능

export const SCHOOLS: School[] = [
  { id: 'pond-1',  spot: 'pond',  x: 150, y: 130 },
  { id: 'pond-2',  spot: 'pond',  x: 80,  y: 150 },
  { id: 'river-1', spot: 'river', x: 380, y: 60 },
  { id: 'river-2', spot: 'river', x: 520, y: 150 },
  { id: 'sea-1',   spot: 'sea',   x: 100, y: 280 },
  { id: 'sea-2',   spot: 'sea',   x: 350, y: 320 },
  { id: 'deep-1',  spot: 'deep',  x: 520, y: 230 },
  { id: 'deep-2',  spot: 'deep',  x: 590, y: 320 },
];

// R4: 바다는 어디든 항해 가능, 섬·경계만 막힘
export function canSail(x: number, y: number): boolean {
  if (x < 4 || y < 4 || x >= WORLD_W - 4 || y >= WORLD_H - 4) return false;
  if (inRect(x, y, HOME_ISLAND)) return false;
  for (const i of ISLANDS) if (inRect(x, y, i)) return false;
  return true;
}

// 축별로 나눠 이동 → 해안선을 따라 미끄러짐
export function movePlayer(pos: Point, dirX: number, dirY: number, dt: number, speed = 85): Point {
  const nx = pos.x + dirX * speed * dt;
  const ny = pos.y + dirY * speed * dt;
  const out = { ...pos };
  if (canSail(nx, out.y)) out.x = nx;
  if (canSail(out.x, ny)) out.y = ny;
  return out;
}

export function atDock(pos: Point): boolean {
  return inRect(pos.x, pos.y, DOCK);
}

export function nearestSchoolInRange(x: number, y: number, range = CAST_RANGE): School | null {
  let best: School | null = null, bestD = range;
  for (const s of SCHOOLS) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= bestD) { bestD = d; best = s; }
  }
  return best;
}

// 집 내부 가구 (뷰 좌표 320×180) — R1~R3b
export interface Furniture extends Rect { id: 'sell' | 'rod' | 'dex' | 'exit'; label: string }

export const FURNITURE: Furniture[] = [
  { id: 'dex',  label: '책장',      x: 36,  y: 58,  w: 40, h: 60 },
  { id: 'rod',  label: '작업대',    x: 130, y: 90,  w: 50, h: 34 },
  { id: 'sell', label: '판매 궤짝', x: 200, y: 94,  w: 44, h: 32 },
  { id: 'exit', label: '문',        x: 272, y: 104, w: 34, h: 56 },
];

export function furnitureAt(x: number, y: number): Furniture | null {
  for (const f of FURNITURE) if (inRect(x, y, f)) return f;
  return null;
}
