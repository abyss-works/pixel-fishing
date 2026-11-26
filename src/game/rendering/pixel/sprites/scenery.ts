// 지형 스프라이트 — 물/대륙/통행판/나무/라벨을 스타일 토큰에 맞춰 그린다.
// (계층: 단위 스프라이트 — 배치는 장면 합성기가 결정)
import { R, label } from '../common.js';
import type { Ctx } from '../common.js';
import { DECK_STYLE, FIELD_LABEL, WATER_STYLE } from '../styles.js';
import type { MapLabel, Rect, TerrainPiece } from '../../../world/types';

export function drawWater(ctx: Ctx, t: Extract<TerrainPiece, { kind: 'water' }>) {
  const s = WATER_STYLE[t.style];
  if ('rim' in s) R(ctx, t.rect.x - 3, t.rect.y - 2, t.rect.w + 6, t.rect.h + 5, s.rim);
  R(ctx, t.rect.x, t.rect.y, t.rect.w, t.rect.h, s.fill);
  if ('edge' in s) R(ctx, t.rect.x, t.rect.y, t.rect.w, s.edgeH, s.edge);
}

// 지도용 플랫 채움 (테두리/모래테 장식 없음)
export function drawWaterFill(ctx: Ctx, style: keyof typeof WATER_STYLE, r: Rect) {
  R(ctx, r.x, r.y, r.w, r.h, WATER_STYLE[style].fill);
}

export function drawDeck(ctx: Ctx, t: Extract<TerrainPiece, { kind: 'deck' }>) {
  const { rect } = t;
  R(ctx, rect.x, rect.y, rect.w, rect.h, '#8d6e63');
  for (let y = rect.y; y < rect.y + rect.h; y += DECK_STYLE[t.style].gap) {
    R(ctx, rect.x, y, rect.w, 1, '#795548');
  }
}

export function drawLand(ctx: Ctx, r: Rect) {
  R(ctx, r.x - 3, r.y - 2, r.w + 6, r.h + 5, '#e9c46a');
  R(ctx, r.x, r.y, r.w, r.h, '#74c69d');
  R(ctx, r.x + 2, r.y + 2, Math.max(r.w - 4, 2), 2, '#8fd6b0');
  if (r.w >= 60 && r.h >= 40) {
    for (let i = 0; i < Math.floor((r.w * r.h) / 3000); i++) {
      const tx = r.x + 8 + (i * 53) % Math.max(r.w - 20, 1);
      const ty = r.y + 8 + (i * 37) % Math.max(r.h - 20, 1);
      R(ctx, tx, ty, 8, 7, '#2d6a4f');
      R(ctx, tx + 3, ty + 7, 3, 4, '#6d4c41');
    }
  }
}

export function drawTree(ctx: Ctx, tx: number, ty: number) {
  R(ctx, tx + 3, ty + 10, 4, 8, '#6d4c41');
  R(ctx, tx - 2, ty, 14, 12, '#2d6a4f');
}

export function drawXmasTree(ctx: Ctx, tx: number, ty: number) {
  R(ctx, tx + 4, ty + 14, 4, 5, '#5d4037');
  R(ctx, tx - 2, ty + 10, 16, 4, '#1b4332');
  R(ctx, tx, ty + 6, 12, 4, '#2d6a4f');
  R(ctx, tx + 2, ty + 2, 8, 4, '#2d6a4f');
  R(ctx, tx + 4, ty - 1, 4, 3, '#40916c');
  R(ctx, tx + 5, ty - 3, 2, 2, '#ffd54f');
  // 눈 끝과 장식 방울
  R(ctx, tx - 1, ty + 10, 3, 1, '#edf5fc');
  R(ctx, tx + 10, ty + 10, 3, 1, '#edf5fc');
  R(ctx, tx + 2, ty + 8, 2, 2, '#e53935');
  R(ctx, tx + 8, ty + 7, 2, 2, '#ffd54f');
  R(ctx, tx + 5, ty + 4, 2, 2, '#4fc3f7');
  R(ctx, tx + 1, ty + 12, 2, 2, '#ffd54f');
  R(ctx, tx + 9, ty + 12, 2, 2, '#e53935');
}

export function drawSnowPine(ctx: Ctx, tx: number, ty: number) {
  R(ctx, tx + 4, ty + 13, 4, 5, '#5d4037');
  R(ctx, tx - 1, ty + 9, 14, 4, '#1b4332');
  R(ctx, tx + 1, ty + 5, 10, 4, '#2d6a4f');
  R(ctx, tx + 3, ty + 1, 6, 4, '#2d6a4f');
  R(ctx, tx + 3, ty + 1, 6, 2, '#edf5fc');
  R(ctx, tx + 1, ty + 5, 4, 1, '#edf5fc');
  R(ctx, tx + 7, ty + 5, 4, 1, '#cfe2f5');
  R(ctx, tx - 1, ty + 9, 4, 1, '#edf5fc');
  R(ctx, tx + 9, ty + 9, 4, 1, '#cfe2f5');
}

export function drawSnowman(ctx: Ctx, tx: number, ty: number) {
  R(ctx, tx + 1, ty + 10, 10, 7, '#edf5fc');
  R(ctx, tx + 2, ty + 15, 8, 2, '#cfe2f5');
  R(ctx, tx + 2, ty + 4, 8, 6, '#edf5fc');
  R(ctx, tx + 1, ty + 9, 10, 2, '#e53935');
  R(ctx, tx + 7, ty + 11, 2, 3, '#e53935');
  // 모자·눈·당근 코·단추
  R(ctx, tx + 1, ty + 3, 10, 1, '#182540');
  R(ctx, tx + 3, ty, 6, 3, '#263238');
  R(ctx, tx + 4, ty + 6, 1, 1, '#182540');
  R(ctx, tx + 7, ty + 6, 1, 1, '#182540');
  R(ctx, tx + 6, ty + 7, 2, 1, '#ff7043');
  R(ctx, tx + 5, ty + 12, 1, 1, '#182540');
  R(ctx, tx + 5, ty + 14, 1, 1, '#182540');
}

export function drawGiftBox(ctx: Ctx, tx: number, ty: number) {
  R(ctx, tx, ty + 2, 8, 7, '#c62828');
  R(ctx, tx + 3, ty + 2, 2, 7, '#ffd54f');
  R(ctx, tx, ty + 5, 8, 2, '#ffd54f');
  R(ctx, tx + 1, ty, 2, 2, '#ffd54f');
  R(ctx, tx + 5, ty, 2, 2, '#ffd54f');
}

export function drawCandyCane(ctx: Ctx, tx: number, ty: number) {
  R(ctx, tx + 2, ty + 2, 2, 10, '#edf5fc');
  R(ctx, tx + 2, ty + 1, 4, 2, '#e53935');
  R(ctx, tx + 5, ty + 2, 2, 3, '#edf5fc');
  R(ctx, tx + 2, ty + 4, 2, 2, '#e53935');
  R(ctx, tx + 2, ty + 8, 2, 2, '#e53935');
}

export function drawWinterLantern(ctx: Ctx, tx: number, ty: number) {
  R(ctx, tx + 2, ty + 6, 2, 11, '#37474f');
  R(ctx, tx + 1, ty + 16, 4, 2, '#263238');
  R(ctx, tx, ty + 1, 6, 2, '#37474f');
  R(ctx, tx + 1, ty, 4, 1, '#edf5fc');
  R(ctx, tx + 1, ty + 3, 4, 4, '#ffd54f');
  R(ctx, tx + 2, ty + 4, 2, 2, '#fff8e1');
}

// 지명/시설 라벨 — 필드 팔레트
export function drawLabel(ctx: Ctx, l: MapLabel) {
  label(ctx, l.text, l.x, l.y, FIELD_LABEL[l.color ?? 'text'], l.size ?? 9);
}
