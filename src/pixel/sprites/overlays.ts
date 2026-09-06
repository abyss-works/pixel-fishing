// 게임 상태 오버레이 스프라이트 — 군집/낚싯줄·찌/타이밍 바처럼 "상태를 월드 좌표에 그리는" 것들.
// 상태는 파라미터(FieldView 조각)로만 받는다 — React/게임 규칙 직접 의존 금지 (계층: 단위 스프라이트)
import { R, label, UI } from '../common.js';
import type { Ctx } from '../common.js';
import { SPOTS } from '../../data/spots';
import type { School } from '../../world/types';

export interface GearView {
  player: { x: number; y: number };
  school: School | null;
  phase: string;
  biteT: number | null;
  zone: number;
  /** 빨간 존(PERFECT) 폭 — 파워 게이트 초과 보너스. 없으면 그리지 않는다 */
  red?: number;
  t: number;
}

/** zoom = 마커 크기 보정(1 기본). 미니맵처럼 pack 좌표를 축소 그리는 캔버스에서 지도가 커지면
 *  마커가 화면에서 쪼그라들므로, renderWorldMap이 1/s를 넣어 **표시 크기를 일정하게** 유지한다. */
export function drawSchools(ctx: Ctx, schools: School[], boat: number, t: number,
                            lockLabel = true, zoom = 1) {
  for (const s of schools) {
    const req = SPOTS.find(sp => sp.id === s.spot)!;
    const locked = boat < req.boatTier;
    R(ctx, s.x - 12 * zoom, s.y - 8 * zoom, 24 * zoom, 16 * zoom, 'rgba(255,255,255,0.05)');
    for (let i = 0; i < 3; i++) {
      const a = t * 1.6 + i * 2.09;
      const fx = s.x + Math.cos(a) * 7 * zoom, fy = s.y + Math.sin(a) * 5 * zoom;
      const c = locked ? 'rgba(0,0,0,0.3)' : 'rgba(8,25,38,0.55)';
      R(ctx, fx - 3 * zoom, fy - 1 * zoom, 6 * zoom, 2 * zoom, c);
      R(ctx, fx + 3 * zoom, fy - 2 * zoom, 2 * zoom, 4 * zoom, c);
    }
    if (locked && lockLabel) label(ctx, `배 ${req.boatTier}단계`, s.x, s.y - 11, UI.danger, 8);
  }
}

export function drawFishingGear(ctx: Ctx, v: GearView) {
  if (v.phase === 'idle' || !v.school) return;
  const bob = v.phase === 'bite' ? Math.sin(v.t * 30) * 2 : Math.sin(v.t * 2);
  const bx = v.school.x, by = v.school.y + bob;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(v.player.x, v.player.y - 14);
  ctx.lineTo(bx, by - 2);
  ctx.stroke();
  R(ctx, bx - 2, by - 2, 4, 4, '#e53935');
  R(ctx, bx - 2, by - 4, 4, 2, '#fff');
  if (v.phase === 'bite') label(ctx, '!', bx, by - 10, UI.gold, 22);
}

// 타이밍 바 — 중앙 노란 존 = GOOD, 그 안의 빨간 존 = PERFECT (R6b + 파워 게이트 보너스)
export function drawTimingBar(ctx: Ctx, v: GearView) {
  if (v.phase !== 'bite' || v.biteT === null) return;
  const bw = 44, bh = 5;
  const bx = v.player.x - bw / 2, by = v.player.y - 30;
  R(ctx, bx - 1, by - 1, bw + 2, bh + 2, UI.shadow);
  R(ctx, bx, by, bw, bh, '#26364f');
  if (v.zone > 0.02) {
    const zw = bw * v.zone;
    R(ctx, bx + (bw - zw) / 2, by, zw, bh, 'rgba(255,213,79,0.85)');
  }
  if (v.red && v.red > 0.02) {
    const rw = bw * v.red;
    R(ctx, bx + (bw - rw) / 2, by, rw, bh, 'rgba(239,83,80,0.9)');
  }
  const cx = bx + Math.min(v.biteT, 1) * bw;
  R(ctx, cx - 1, by - 2, 2, bh + 4, '#fff');
}
