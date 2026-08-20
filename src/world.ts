// 2지역 월드 — 순수 모듈 (R4, R4b, R5)
//   지역 1 '마을': 육지 도보, 집 정비, 연못/강 낚시 (배 불필요)
//   지역 2 '대양': 단순화한 지구 바다, 배 항해, 항구 정비 (태평양/심해 해구)
// 지역이 늘어나면(SF/판타지) REGIONS에 추가된다.
import type { SpotId } from './logic';

export type RegionId = 'village' | 'ocean';

export const REGIONS: Record<RegionId, { name: string }> = {
  village: { name: '마을 — 고향' },
  ocean: { name: '지구 — 태평양' },
};

export const VIEW_W = 320, VIEW_H = 180;

export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

const inRect = (x: number, y: number, r: Rect) =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export interface School { id: string; spot: SpotId; x: number; y: number }

export const CAST_RANGE = 28; // 군집 근처(도보)/위(배)에서만 캐스팅

// ============ 지역 1: 마을 (640×360, 육지 기반) ============

export const VILLAGE_W = 640, VILLAGE_H = 360;

export const V_POND: Rect = { x: 110, y: 95, w: 90, h: 56 };
export const V_RIVER: Rect = { x: 0, y: 200, w: 640, h: 44 };  // 마을을 가로지르는 강
export const V_SEA: Rect = { x: 0, y: 310, w: 640, h: 50 };    // 남쪽 바다(대양 연결)
export const V_HOUSE: Rect = { x: 36, y: 28, w: 64, h: 52 };
export const V_DOOR: Rect = { x: 58, y: 80, w: 20, h: 8 };     // 집 진입 트리거
export const V_SPAWN: Point = { x: 68, y: 100 };
export const V_BRIDGE: Rect = { x: 300, y: 196, w: 24, h: 52 }; // 강 다리
export const V_PIER: Rect = { x: 308, y: 304, w: 16, h: 40 };   // 포구 부두(바다 위 보행)
export const V_PORT: Rect = { x: 308, y: 332, w: 16, h: 12 };   // 대양 출항 트리거(배 필요)
export const V_PORT_FRONT: Point = { x: 316, y: 296 };          // 여객선 귀향 도착 지점

export const V_SCHOOLS: School[] = [
  { id: 'v-pond-1',  spot: 'pond',  x: 150, y: 118 },
  { id: 'v-pond-2',  spot: 'pond',  x: 180, y: 138 },
  { id: 'v-river-1', spot: 'river', x: 100, y: 222 },
  { id: 'v-river-2', spot: 'river', x: 480, y: 222 },
];

export function canWalkVillage(x: number, y: number): boolean {
  if (x < 4 || y < 4 || x >= VILLAGE_W - 4 || y >= VILLAGE_H - 4) return false;
  if (inRect(x, y, V_HOUSE)) return false;
  if (inRect(x, y, V_BRIDGE) || inRect(x, y, V_PIER)) return true; // 다리/부두
  return !inRect(x, y, V_POND) && !inRect(x, y, V_RIVER) && !inRect(x, y, V_SEA);
}

export function villageZoneAt(x: number, y: number): SpotId | null {
  if (inRect(x, y, V_POND)) return 'pond';
  if (inRect(x, y, V_RIVER)) return 'river';
  return null;
}

// ============ 지역 2: 대양 (960×540, 단순화한 지구) ============

export const OCEAN_W = 960, OCEAN_H = 540;

export const LANDS: (Rect & { name?: string })[] = [
  { x: 0,   y: 0,   w: 360, h: 120, name: '유라시아' },
  { x: 0,   y: 100, w: 220, h: 80 },
  { x: 240, y: 90,  w: 60,  h: 40 },
  { x: 285, y: 120, w: 36,  h: 62, name: '한반도' },
  { x: 370, y: 150, w: 18,  h: 40, name: '일본 열도' },
  { x: 395, y: 190, w: 16,  h: 34 },
  { x: 415, y: 230, w: 14,  h: 26 },
  { x: 40,  y: 260, w: 140, h: 140, name: '아프리카' },
  { x: 300, y: 310, w: 40,  h: 24, name: '동남아 제도' },
  { x: 352, y: 340, w: 30,  h: 20 },
  { x: 560, y: 430, w: 110, h: 70, name: '오세아니아' },
  { x: 860, y: 0,   w: 100, h: 540, name: '아메리카' },
  { x: 800, y: 180, w: 80,  h: 70 },
  { x: 820, y: 350, w: 80,  h: 90 },
];

// 마리아나 해구 외 전부 태평양
export const TRENCH: Rect = { x: 470, y: 260, w: 170, h: 160 };

export function oceanZoneAt(x: number, y: number): SpotId {
  return inRect(x, y, TRENCH) ? 'deep' : 'sea';
}

export const HARBOR: Rect = { x: 285, y: 150, w: 36, h: 32 };  // 항구 외관(한반도 남단)
export const O_DOCK: Rect = { x: 293, y: 184, w: 20, h: 12 };  // 접안 트리거(물 위)
export const O_SPAWN: Point = { x: 303, y: 206 };

export const O_SCHOOLS: School[] = [
  { id: 'o-sea-1',  spot: 'sea',  x: 340, y: 210 },
  { id: 'o-sea-2',  spot: 'sea',  x: 560, y: 120 },
  { id: 'o-sea-3',  spot: 'sea',  x: 720, y: 300 },
  { id: 'o-deep-1', spot: 'deep', x: 520, y: 320 },
  { id: 'o-deep-2', spot: 'deep', x: 590, y: 380 },
];

export function canSailOcean(x: number, y: number): boolean {
  if (x < 4 || y < 4 || x >= OCEAN_W - 4 || y >= OCEAN_H - 4) return false;
  for (const l of LANDS) if (inRect(x, y, l)) return false;
  return true;
}

// ============ 지역 공통 ============

export interface RegionDef {
  id: RegionId;
  name: string;
  w: number;
  h: number;
  canMove(x: number, y: number): boolean;
  schools: School[];
  spawn: Point;
  baseTrigger: Rect;   // 집 문 / 항구 접안
  travelTrigger?: Rect; // 다른 지역으로 (마을 포구)
}

export const REGION_DEFS: Record<RegionId, RegionDef> = {
  village: {
    id: 'village', name: REGIONS.village.name,
    w: VILLAGE_W, h: VILLAGE_H,
    canMove: canWalkVillage,
    schools: V_SCHOOLS,
    spawn: V_SPAWN,
    baseTrigger: V_DOOR,
    travelTrigger: V_PORT,
  },
  ocean: {
    id: 'ocean', name: REGIONS.ocean.name,
    w: OCEAN_W, h: OCEAN_H,
    canMove: canSailOcean,
    schools: O_SCHOOLS,
    spawn: O_SPAWN,
    baseTrigger: O_DOCK,
  },
};

// 축별로 나눠 이동 → 벽/해안선을 따라 미끄러짐 (R4)
export function movePlayer(
  region: RegionDef, pos: Point, dirX: number, dirY: number, dt: number, speed: number,
): Point {
  const nx = pos.x + dirX * speed * dt;
  const ny = pos.y + dirY * speed * dt;
  const out = { ...pos };
  if (region.canMove(nx, out.y)) out.x = nx;
  if (region.canMove(out.x, ny)) out.y = ny;
  return out;
}

export function inTrigger(pos: Point, r: Rect | undefined): boolean {
  return !!r && inRect(pos.x, pos.y, r);
}

export function nearestSchoolInRange(
  schools: School[], x: number, y: number, range = CAST_RANGE,
): School | null {
  let best: School | null = null, bestD = range;
  for (const s of schools) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= bestD) { bestD = d; best = s; }
  }
  return best;
}

// ============ 거점 시설 (뷰 좌표 320×180) — R1~R3b ============

export type BaseId = 'home' | 'harbor';
export type FurnitureId = 'sell' | 'rod' | 'boat' | 'dex' | 'exit' | 'travel';

export interface Furniture extends Rect { id: FurnitureId; label: string }

// 집 (마을): 궤짝/작업대/목공소/책장/문
export const HOME_FURNITURE: Furniture[] = [
  { id: 'dex',  label: '책장',      x: 36,  y: 58,  w: 40, h: 60 },
  { id: 'rod',  label: '작업대',    x: 130, y: 90,  w: 50, h: 34 },
  { id: 'sell', label: '판매 궤짝', x: 200, y: 94,  w: 44, h: 32 },
  { id: 'boat', label: '목공소',    x: 88,  y: 132, w: 48, h: 30 },
  { id: 'exit', label: '문',        x: 272, y: 104, w: 34, h: 56 },
];

// 항구 (대양): 어시장/공방/조선소/사무소/승선/여객선
export const HARBOR_FURNITURE: Furniture[] = [
  { id: 'dex',    label: '항만 사무소', x: 36,  y: 58,  w: 40, h: 60 },
  { id: 'rod',    label: '낚시 공방',   x: 130, y: 90,  w: 50, h: 34 },
  { id: 'sell',   label: '어시장',      x: 200, y: 94,  w: 44, h: 32 },
  { id: 'boat',   label: '조선소',      x: 88,  y: 132, w: 48, h: 30 },
  { id: 'exit',   label: '승선',        x: 272, y: 104, w: 34, h: 56 },
  { id: 'travel', label: '여객선',      x: 16,  y: 132, w: 56, h: 30 },
];

export const BASE_FURNITURE: Record<BaseId, Furniture[]> = {
  home: HOME_FURNITURE,
  harbor: HARBOR_FURNITURE,
};

export function furnitureAt(base: BaseId, x: number, y: number): Furniture | null {
  for (const f of BASE_FURNITURE[base]) if (inRect(x, y, f)) return f;
  return null;
}
