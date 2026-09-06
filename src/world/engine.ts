// 지역 엔진 — 지역 데이터에서 충돌·수역·이동을 파생하는 순수 함수들 (R4, R5)
// 지형 소스는 둘: 항해 지역은 마스크 격자(pack.map), 마을 같은 walk 지역은 rect 조각(terrain).
// 판정 규칙은 types.ts 주석 참조.
import type { Point, Rect, RegionPack, School, TriggerDef } from './types';
import { cellDefAt } from './mask';
import { zoneById, topZoneOf } from '../data/zones';
import type { ZoneId } from '../data/zones';
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

// 구역 판정 — 마스크면 셀의 zone, walk 지역(마을)은 단일 구역. 모르면 undefined(구역 밖 물).
// **셀은 존만 안다**(spec/zone-tree.md) — 스팟은 존 안에 배치되는 어군 오브젝트라 캐스팅
// 판정도 학교(가까운 어군) 기준이다. 하위 존(해구 등) 위에 서면 하위 존이 반환된다 —
// 로어 표시 규칙("가장 구체적인 존 우선")의 근원.
export function zoneOf(pack: RegionPack, x: number, y: number): ZoneId | undefined {
  if (pack.map) return cellDefAt(pack.map, x, y)?.zone;
  return pack.movement === 'walk' ? 'village' : undefined;
}

// ---------- 존 전이 추적기 (오픈월드 고도화 A-1·A-2 + 존 계층화) ----------

export interface ZoneStep {
  /** 게이트에 막혔다 — 호출부는 위치를 직전 프레임으로 되밀고 blocked 안내문을 띄운다 */
  revert: boolean;
  blocked: string | null;
  /** 최상위 존 진입 확정(dwell 통과) — 진입 토스트용. 하위 존 전환은 토스트 없이
   *  로어·어군 상세가 함께 바뀐다(표시 존은 Field가 어군 우선으로 파생) */
  enteredTop: ZoneId | null;
}

/** 존 전이 상태 기계 — **게이트 전용**이다. 표시 존은 Field가 파생한다(사거리 내 어군이
 *  있으면 그 어군의 존 — 어군 정보 트리거와 로어 트리거를 통일, 없으면 셀 구역의 최상위 존).
 *  게이트 판정은 **즉시**(경계를 넘는 순간 되밀어야 자원 침범이 없다). 최상위 존 진입
 *  토스트만 dwell 히스테리시스(400ms)로 확정한다 — 경계 왕복 시 토스트 낭비 방지. */
export class ZoneTracker {
  private dwellMs: number;
  /** 게이트 판정 기준 — 셀 구역, 경계 통과 즉시 갱신(하위 존 포함) */
  private zone: ZoneId | null = null;
  /** 마지막 확정 최상위 존 — 진입 토스트 중복 방지 */
  private shownTop: ZoneId | null = null;
  private pending: { top: ZoneId; at: number } | null = null;

  constructor(dwellMs = 400) {
    this.dwellMs = dwellMs;
  }

  /** 진입(마운트·씬 전환) — 토스트 없이 현재 구역부터 시작한다 */
  init(z: ZoneId | null): void {
    this.zone = z;
    this.shownTop = z ? topZoneOf(z) : null;
    this.pending = null;
  }

  /** 이동 루프마다 호출. z = 현재 셀 구역(zoneOf, 구역 밖 물은 null) */
  step(z: ZoneId | null, now: number, boat: number): ZoneStep {
    if (z && z !== this.zone) {
      // 게이트 — 진입 요구 배 미달이면 즉시 되밀기 (기준 zone은 그대로다)
      const gate = zoneById(z);
      if (gate?.entryBoat && boat < gate.entryBoat) {
        return { revert: true, blocked: gate.gateMsg ?? '더 튼튼한 배가 필요하다.', enteredTop: null };
      }
      this.zone = z;
      const top = topZoneOf(z);
      if (top !== this.shownTop) this.pending = { top, at: now };
      else this.pending = null;
    } else if (this.pending) {
      if (!z || topZoneOf(z) !== this.pending.top) {
        this.pending = null; // 경계에서 되돌아갔다 — "들어섰다" 취소 (떨림 방지)
      } else if (now - this.pending.at >= this.dwellMs) {
        this.shownTop = this.pending.top;
        const enteredTop = this.pending.top;
        this.pending = null;
        return { revert: false, blocked: null, enteredTop };
      }
    }
    return { revert: false, blocked: null, enteredTop: null };
  }
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
