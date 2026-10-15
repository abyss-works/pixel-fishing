// 격자 페인터 프리미티브 — 32×16 인덱스 격자에 셀 단위로 칠한다. 배 스프라이트 생성 전용.
import { INDEX_CHARS, TRANSPARENT } from '../../../src/game/content/sprites/types';

export class Grid {
  readonly cells: (number | null)[][];
  constructor(readonly w: number, readonly h: number) {
    this.cells = Array.from({ length: h }, () => Array<number | null>(w).fill(null));
  }
  put(x: number, y: number, c: number): void {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y][x] = c;
  }
  hline(x0: number, x1: number, y: number, c: number): void {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.put(x, y, c);
  }
  vline(x: number, y0: number, y1: number, c: number): void {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.put(x, y, c);
  }
  rect(x: number, y: number, w: number, h: number, c: number): void {
    for (let yy = 0; yy < h; yy++) this.hline(x, x + w - 1, y + yy, c);
  }
  /** 다각형 채우기 — 짝홀 규칙, 셀 중심 기준 */
  poly(pts: readonly (readonly [number, number])[], c: number): void {
    const ys = pts.map(p => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const cy = y + 0.5, xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= cy && y1 > cy) || (y1 <= cy && y0 > cy)) xs.push(x0 + ((cy - y0) * (x1 - x0)) / (y1 - y0));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.put(x, y, c);
      }
    }
  }
  rows(): string[] {
    return this.cells.map(r => r.map(c => (c === null ? TRANSPARENT : INDEX_CHARS[c])).join(''));
  }
}
