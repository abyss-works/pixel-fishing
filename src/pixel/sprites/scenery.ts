// 지형 스프라이트 — 물/대륙/통행판/나무/라벨. 스타일 토큰(styles.ts)을 참조해 그린다
// (계층: 단위 스프라이트 — 어디에 놓일지는 컴포지터(scenes/)가 결정)
import { R, label } from '../common.js';
import type { Ctx } from '../common.js';
import { DECK_STYLE, FIELD_LABEL, MAP_LABEL, WATER_STYLE } from '../styles.js';
import type { MapLabel, Rect, TerrainPiece } from '../../world/types';

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

// 지명/시설 라벨 — 필드/지도 팔레트 분기
export function drawLabel(ctx: Ctx, l: MapLabel, map = false) {
  const palette = map ? MAP_LABEL : FIELD_LABEL;
  label(ctx, l.text, l.x, l.y, palette[l.color ?? 'text'], l.size ?? 9);
}
