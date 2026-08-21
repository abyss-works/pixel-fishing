// 지역 엔진 — RegionPack 데이터에서 충돌·수역·이동을 파생하는 순수 함수들 (R4, R5)
// 지역별 손코딩 충돌 함수(구 canWalkVillage/canSailOcean)를 대체한다. 규칙은 types.ts 주석 참조.
import type { Point, Rect, RegionPack, School } from './types';
import type { SpotId } from '../data/spots';
import { CAST_RANGE } from '../game/balance';

export { CAST_RANGE }; // 군집 판정 반경 — 기존 import 경로 호환

export const inRect = (x: number, y: number, r: Rect): boolean =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

const MARGIN = 4; // 지도 경계 여유

export function canMove(pack: RegionPack, x: number, y: number): boolean {
  if (x < MARGIN || y < MARGIN || x >= pack.w - MARGIN || y >= pack.h - MARGIN) return false;
  for (const b of pack.buildings) if (inRect(x, y, b.rect)) return false;
  if (pack.movement === 'walk') {
    for (const t of pack.terrain) if (t.kind === 'deck' && inRect(x, y, t.rect)) return true;
    for (const t of pack.terrain) if (t.kind === 'water' && inRect(x, y, t.rect)) return false;
    return true; // 지반
  }
  // sail: 대륙만 장애물, 그 외 전부 물
  for (const t of pack.terrain) if (t.kind === 'land' && inRect(x, y, t.rect)) return false;
  return true;
}

// 수역 판정 — spot 있는 water 조각 위면 그 수역, 아니면 지역 기본 해역(sail) 또는 null(walk)
export function zoneAt(pack: RegionPack, x: number, y: number): SpotId | null {
  for (const t of pack.terrain) {
    if (t.kind === 'water' && t.spot && inRect(x, y, t.rect)) return t.spot;
  }
  return pack.defaultSpot ?? null;
}

// 축별로 나눠 이동 → 벽/해안선을 따라 미끄러짐 (R4)
export function movePlayer(
  pack: RegionPack, pos: Point, dirX: number, dirY: number, dt: number, speed: number,
): Point {
  const nx = pos.x + dirX * speed * dt;
  const ny = pos.y + dirY * speed * dt;
  const out = { ...pos };
  if (canMove(pack, nx, out.y)) out.x = nx;
  if (canMove(pack, out.x, ny)) out.y = ny;
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
