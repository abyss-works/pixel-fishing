// 배우 스프라이트 — 플레이어(도보)/배(항해). 자기 좌표계만 알고 상태를 모른다 (계층: 단위 스프라이트)
import { label, R, UI } from '../common.js';
import type { Ctx } from '../common.js';
import { DEFAULT_LOOK, PANTS_COLORS, SHIRT_COLORS, hatById } from '../../../content/wardrobe.js';
import type { Look } from '../../../content/wardrobe.js';

/** 사람 — (x, y)는 발 아래 가운데다. 모자가 없으면 머리카락을 그린다 */
export function drawPerson(ctx: Ctx, x: number, y: number, look: Look = DEFAULT_LOOK) {
  R(ctx, x - 3, y - 16, 6, 6, '#ffcc99');
  const hat = hatById(look.hat);
  if (hat) {
    // 단순한 모자 — 머리 위 덮개와 한쪽 챙, 한 가지 색
    R(ctx, x - 4, y - 19, 8, 3, hat.color);
    R(ctx, x + 3, y - 16, 3, 1, hat.color);
  } else {
    R(ctx, x - 4, y - 18, 8, 3, '#8d6e63');
    R(ctx, x - 2, y - 19, 4, 2, '#8d6e63');
  }
  R(ctx, x - 3, y - 10, 6, 7, SHIRT_COLORS[look.shirt]);
  R(ctx, x - 2, y - 3, 4, 3, PANTS_COLORS[look.pants]);
}

// 필드의 배는 단계와 무관한 작은 쪽배다 — 단계별 배 스프라이트는 조선소 화면에서만 쓴다.
export function drawBoat(ctx: Ctx, x: number, y: number, t: number, look: Look = DEFAULT_LOOK) {
  const rock = Math.sin(t * 2.2) * 1;
  R(ctx, x - 9, y - 2 + rock, 18, 5, '#8d6e63');
  R(ctx, x - 7, y + 3 + rock, 14, 2, '#6d4c41');
  R(ctx, x - 9, y - 3 + rock, 18, 1, '#a1887f');
  drawPerson(ctx, x, y - 1 + rock, look);
}

/** 머리 위 말풍선 — 최근 채팅 글, 입력 중이면 'typing', 없으면 null */
export type Speech = string | 'typing' | null;

/** 다른 플레이어의 배 — 내 배와 구분되게 반투명으로 그리고, 이름과 드리운 낚싯줄을 함께 그린다 */
export interface OtherShipView {
  x: number; y: number; nick: string; line: boolean; stale: boolean;
  /** 찌가 떠 있는 자리 — 보낸 사람의 실제 어군 위치. 없으면(이전 클라이언트) 배 옆에 그린다 */
  bob?: { x: number; y: number } | null;
  bubble?: Speech;
  /** 방치 시간 문자열 — 말풍선이 없고 멈춰 있을 때만 받는다 */
  idle?: string | null;
  /** 외형 — 없으면 기본 외형 */
  look?: Look;
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
  drawBoat(ctx, o.x, o.y, t, o.look);
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
  drawSpeech(ctx, o.x, o.y - 34, o.bubble ?? null);
  drawIdle(ctx, o.x, o.y - 34, o.idle ?? null);
}

/** 말풍선 — (x, y)는 꼬리 바로 위다. 입력 중이면 "…", 긴 글은 줄여서 보인다 */
export function drawSpeech(ctx: Ctx, x: number, y: number, speech: Speech) {
  if (speech === null) return;
  const chars = [...(speech === 'typing' ? '…' : speech)];
  drawBubble(ctx, x, y, chars.length > BUBBLE_CHARS ? `${chars.slice(0, BUBBLE_CHARS).join('')}…` : chars.join(''));
}

/** 방치 시간 — 말풍선이 뜨는 자리(x, y)에 픽셀 서체 보조색 작은 글자로 그린다. 없으면 그리지 않는다 */
export function drawIdle(ctx: Ctx, x: number, y: number, text: string | null) {
  if (text === null) return;
  ctx.font = "7px 'Silkscreen', 'Courier New', monospace";
  ctx.textAlign = 'center';
  ctx.fillStyle = UI.shadow;
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = UI.dim;
  ctx.fillText(text, x, y);
}
