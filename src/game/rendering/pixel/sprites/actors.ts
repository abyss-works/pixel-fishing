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
export interface OtherShipView {
  x: number; y: number; nick: string; line: boolean; stale: boolean;
  /** 찌가 떠 있는 자리 — 보낸 사람의 실제 어군 위치. 없으면(이전 클라이언트) 배 옆에 그린다 */
  bob?: { x: number; y: number } | null;
  /** 머리 위 말풍선 — 최근 채팅 글, 입력 중이면 'typing', 없으면 null */
  bubble?: string | 'typing' | null;
}

// 말풍선에 보이는 최대 글자 수 — 넘으면 줄여서 보인다
const BUBBLE_CHARS = 14;

function drawBubble(ctx: Ctx, x: number, y: number, text: string) {
  ctx.font = "bold 8px 'Malgun Gothic', sans-serif";
  const w = Math.ceil(ctx.measureText(text).width) + 8;
  const left = Math.round(x - w / 2);
  R(ctx, left, y - 10, w, 12, 'rgba(242,247,251,0.92)');
  R(ctx, x - 1, y + 2, 3, 2, 'rgba(242,247,251,0.92)');
  ctx.fillStyle = '#0a1526';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y - 1);
}

export function drawOtherShip(ctx: Ctx, o: OtherShipView, t: number) {
  ctx.save();
  ctx.globalAlpha = o.stale ? 0.25 : 0.6;
  drawBoat(ctx, o.x, o.y, t);
  if (o.line) {
    // 내 찌(drawFishingGear)와 같은 모양 — 낚싯대 끝에서 어군 위의 찌까지 줄을 긋는다
    const wave = Math.sin(t * 2);
    const bx = o.bob ? o.bob.x : o.x + 16, by = (o.bob ? o.bob.y : o.y + 4) + wave;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y - 14);
    ctx.lineTo(bx, by - 2);
    ctx.stroke();
    R(ctx, bx - 2, by - 2, 4, 4, '#e53935');
    R(ctx, bx - 2, by - 4, 4, 2, '#fff');
  }
  ctx.restore();
  label(ctx, o.nick, o.x, o.y - 24, 'rgba(255,255,255,0.75)', 8);
  if (o.bubble === 'typing') drawBubble(ctx, o.x, o.y - 34, '…');
  else if (o.bubble) {
    const chars = [...o.bubble];
    drawBubble(ctx, o.x, o.y - 34, chars.length > BUBBLE_CHARS ? `${chars.slice(0, BUBBLE_CHARS).join('')}…` : o.bubble);
  }
}
