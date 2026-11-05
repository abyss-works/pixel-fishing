// 툴팁 버블 배치 — 요소의 왼쪽 아래에서 오른쪽 아래로 펼치는 것이 기본이고, 화면 끝에 닿으면 안쪽으로 들어온다.
// 오른쪽이 모자라면 왼쪽으로 당기고, 아래가 모자라면 요소 위로 띄운다. 위도 모자라면 화면 안에 맞춘다.

const GAP = 6;
const MARGIN = 8;

export interface Anchor { left: number; top: number; bottom: number }
export interface Size { w: number; h: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

export function placeBubble(anchor: Anchor, size: Size, viewport: Size): { x: number; y: number } {
  const x = clamp(anchor.left, MARGIN, Math.max(MARGIN, viewport.w - size.w - MARGIN));
  const below = anchor.bottom + GAP;
  if (below + size.h <= viewport.h - MARGIN) return { x, y: below };
  const above = anchor.top - GAP - size.h;
  if (above >= MARGIN) return { x, y: above };
  return { x, y: clamp(below, MARGIN, Math.max(MARGIN, viewport.h - size.h - MARGIN)) };
}
