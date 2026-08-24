// 지역 엔진 — 지역 데이터에서 충돌·수역·이동을 파생하는 순수 함수들 (R4, R5)
// 지형 소스는 둘: 항해 지역은 마스크 격자(pack.map), 마을 같은 walk 지역은 rect 조각(terrain).
// 판정 규칙은 types.ts 주석 참조.
import type { Point, Rect, RegionPack, School, TriggerDef } from './types';
import { cellDefAt } from './mask';
import type { SpotId } from '../data/spots';
import { CAST_RANGE } from '../game/balance';

export { CAST_RANGE }; // 군집 판정 반경 — 기존 import 경로 호환

export const inRect = (x: number, y: number, r: Rect): boolean =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

const MARGIN = 4; // 지도 경계 여유

export function canMove(pack: RegionPack, x: number, y: number): boolean {
  if (x < MARGIN || y < MARGIN || x >= pack.w - MARGIN || y >= pack.h - MARGIN) return false;
  for (const b of pack.buildings) if (inRect(x, y, b.rect)) return false;
  if (pack.map) { // 마스크 지형(항해) — 육지만 장애물
    return !cellDefAt(pack.map, x, y)?.land;
  }
  if (pack.movement === 'walk') {
    for (const t of pack.terrain!) if (t.kind === 'deck' && inRect(x, y, t.rect)) return true;
    for (const t of pack.terrain!) if (t.kind === 'water' && inRect(x, y, t.rect)) return false;
    return true; // 지반
  }
  // sail rect 지형(레거시): 대륙만 장애물
  for (const t of pack.terrain!) if (t.kind === 'land' && inRect(x, y, t.rect)) return false;
  return true;
}

// 수역 판정 — 마스크면 셀의 spot, rect 지형이면 spot 있는 water 조각. 없으면 null(낚시 불가)
export function zoneAt(pack: RegionPack, x: number, y: number): SpotId | null {
  if (pack.map) return cellDefAt(pack.map, x, y)?.spot ?? null;
  for (const t of pack.terrain!) {
    if (t.kind === 'water' && t.spot && inRect(x, y, t.rect)) return t.spot;
  }
  return null;
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

// 경계 봉합 입장점 (R5c — 오픈월드 봉합): travel 트리거가 entry를 가지면, 목적지의 마주 보는
// 가장자리에서 "벗어난 자리" 좌표를 보존해 돌려준다. 초기 inset을 크게 잡아 포탈 밖으로
// 확실히 밀어내고, 통행 불가 칸(육지)과 트리거 위는 정렬축 ±스캔으로 회피한다.
const ENTRY_INSETS = [28, 44, 64, 88, 120]; // 가장자리에서 안쪽으로 파고드는 깊이 (포탈 밖 보장)

export function entryPoint(pack: RegionPack, trig: TriggerDef, from: Point): Point {
  if (trig.action !== 'travel' || !trig.entry) return { ...pack.spawn };
  const edge = trig.entry.edge;
  const horiz = edge === 'top' || edge === 'bottom';
  const m = MARGIN + 2;
  const max = horiz ? pack.w - m : pack.h - m;
  const clamp = (v: number) => Math.min(Math.max(v, m), max);
  const primary = clamp(horiz ? from.x : from.y);
  // 가장자리에서 inset만큼 안쪽, 정렬축은 보존한 좌표
  const at = (p: number, inset: number): Point => {
    if (edge === 'top') return { x: p, y: m + inset };
    if (edge === 'bottom') return { x: p, y: pack.h - m - inset };
    if (edge === 'left') return { x: m + inset, y: p };
    return { x: pack.w - m - inset, y: p };
  };
  for (const inset of ENTRY_INSETS) {
    for (let off = 0; ; off += 2) {
      if (primary + off > max && primary - off < m) break;
      for (const o of off === 0 ? [0] : [off, -off]) {
        const cand = at(primary + o, inset);
        if (!canMove(pack, cand.x, cand.y)) continue;          // 육지 위 입장 금지
        if (pack.triggers.some(t => inRect(cand.x, cand.y, t.rect))) continue; // 재발화 금지
        return cand;
      }
    }
  }
  return { ...pack.spawn }; // 최후의 안전망 — 스폰 텔레포트로 강등
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
