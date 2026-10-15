// 픽셀 스프라이트 데이터 — 인덱스 격자 + 팔레트 슬롯 + 프레임 (sprite-data 결정).
// 격자는 행 문자열 배열이다: '.'은 투명, 그 외 문자는 팔레트 인덱스(INDEX_CHARS 순서).
// 팔레트 슬롯은 고정 색('#000') 또는 기준색 대비 밝기 보정({ shade })이다 — 변이·실루엣은
// 기준색을 바꾸거나 전 슬롯을 한 색으로 치환해 표현한다. DOM에 의존하지 않는다(서버 import 그래프 포함).
import { shade } from '../../../shared/lib/color.js';

export type PaletteSlot = string | { shade: number };

export interface PixelSprite {
  w: number;
  h: number;
  palette: readonly PaletteSlot[];
  /** 프레임마다 h개의 행 문자열, 각 행은 w글자 */
  frames: readonly (readonly string[])[];
}

export const TRANSPARENT = '.';
export const INDEX_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';

/** 격자 문자 → 팔레트 인덱스. 투명·미지 문자는 null */
export function cellIndex(ch: string): number | null {
  const i = INDEX_CHARS.indexOf(ch);
  return i < 0 ? null : i;
}

/** 팔레트 슬롯을 기준색으로 해석한 실제 색 배열 */
export function paletteColors(palette: readonly PaletteSlot[], base: string): string[] {
  return palette.map(slot => (typeof slot === 'string' ? slot : shade(base, slot.shade)));
}

export interface Bounds { minX: number; maxX: number; minY: number; maxY: number }

/** 불투명 셀의 경계 — 흔들기 축·배치 계산용. 전부 투명이면 null */
export function opaqueBounds(rows: readonly string[]): Bounds | null {
  let b: Bounds | null = null;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === TRANSPARENT) continue;
      b = b
        ? { minX: Math.min(b.minX, x), maxX: Math.max(b.maxX, x), minY: Math.min(b.minY, y), maxY: Math.max(b.maxY, y) }
        : { minX: x, maxX: x, minY: y, maxY: y };
    }
  });
  return b;
}

/** 윤곽 셀 — 불투명 셀에 4방향으로 닿는 투명 셀의 좌표. 격자 밖 좌표는 내지 않는다 */
export function outlineCells(rows: readonly string[]): [number, number][] {
  const h = rows.length, w = rows[0]?.length ?? 0;
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && rows[y][x] !== TRANSPARENT;
  const out: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (opaque(x, y)) continue;
      if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) out.push([x, y]);
    }
  }
  return out;
}

/** 데이터 무결성 — 행 수·행 길이·문자·인덱스 범위. 문제가 없으면 빈 배열 */
export function validateSprite(s: PixelSprite): string[] {
  const errors: string[] = [];
  if (s.frames.length === 0) errors.push('frames is empty');
  s.frames.forEach((rows, fi) => {
    if (rows.length !== s.h) errors.push(`frame ${fi}: ${rows.length} rows, expected ${s.h}`);
    rows.forEach((row, y) => {
      if (row.length !== s.w) errors.push(`frame ${fi} row ${y}: ${row.length} cols, expected ${s.w}`);
      for (const ch of row) {
        if (ch === TRANSPARENT) continue;
        const idx = cellIndex(ch);
        if (idx === null) errors.push(`frame ${fi} row ${y}: unknown char '${ch}'`);
        else if (idx >= s.palette.length) errors.push(`frame ${fi} row ${y}: index ${idx} outside palette(${s.palette.length})`);
      }
    });
  });
  return errors;
}
