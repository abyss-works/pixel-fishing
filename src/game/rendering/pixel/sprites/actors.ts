// 배우 스프라이트 — 플레이어(도보)/배(항해). 자기 좌표계만 알고 상태를 모른다 (계층: 단위 스프라이트)
import { label, R } from '../common.js';
import type { Ctx } from '../common.js';

export function drawPerson(ctx: Ctx, x: number, y: number) {
  R(ctx, x - 3, y - 16, 6, 6, '#ffcc99');
  R(ctx, x - 4, y - 18, 8, 3, '#8d6e63');
  R(ctx, x - 2, y - 19, 4, 2, '#8d6e63');
  R(ctx, x - 3, y - 10, 6, 7, '#3f6d4e');
  R(ctx, x - 2, y - 3, 4, 3, '#31427a');
}

// 필드의 배는 단계와 무관한 작은 쪽배다 — 단계별 배 스프라이트는 조선소 화면에서만 쓴다(사용자 결정).
export function drawBoat(ctx: Ctx, x: number, y: number, t: number) {
  const rock = Math.sin(t * 2.2) * 1;
  R(ctx, x - 9, y - 2 + rock, 18, 5, '#8d6e63');
  R(ctx, x - 7, y + 3 + rock, 14, 2, '#6d4c41');
  R(ctx, x - 9, y - 3 + rock, 18, 1, '#a1887f');
  drawPerson(ctx, x, y - 1 + rock);
}

/** 다른 플레이어의 배 — 내 배와 구분되게 반투명으로 그리고, 이름과 드리운 낚싯줄을 함께 그린다 */
export interface OtherShipView { x: number; y: number; nick: string; line: boolean; stale: boolean }

export function drawOtherShip(ctx: Ctx, o: OtherShipView, t: number) {
  ctx.save();
  ctx.globalAlpha = o.stale ? 0.25 : 0.6;
  drawBoat(ctx, o.x, o.y, t);
  if (o.line) {
    const bob = Math.sin(t * 2) * 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(o.x + 6, o.y - 14);
    ctx.lineTo(o.x + 16, o.y + 4 + bob);
    ctx.stroke();
    R(ctx, o.x + 14, o.y + 2 + bob, 4, 4, '#e53935');
  }
  ctx.restore();
  label(ctx, o.nick, o.x, o.y - 24, 'rgba(255,255,255,0.75)', 8);
}
