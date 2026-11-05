import { describe, expect, it } from 'vitest';
import { placeBubble } from './tooltipPlacement';

const view = { w: 1000, h: 600 };
const anchor = (left: number, top: number) => ({ left, top, bottom: top + 15 });

describe('툴팁 버블 배치', () => {
  it('공간이 있으면 요소의 왼쪽 아래에서 오른쪽 아래로 펼친다', () => {
    expect(placeBubble(anchor(100, 100), { w: 200, h: 40 }, view)).toEqual({ x: 100, y: 121 });
  });

  it('오른쪽 공간이 모자라면 화면 안쪽으로 당긴다', () => {
    expect(placeBubble(anchor(900, 100), { w: 280, h: 40 }, view)).toEqual({ x: 1000 - 280 - 8, y: 121 });
  });

  it('왼쪽 끝을 넘지 않는다', () => {
    expect(placeBubble(anchor(-20, 100), { w: 100, h: 40 }, view).x).toBe(8);
  });

  it('아래 공간이 모자라면 요소 위로 띄운다', () => {
    expect(placeBubble(anchor(100, 570), { w: 200, h: 60 }, view)).toEqual({ x: 100, y: 570 - 6 - 60 });
  });

  it('위아래 모두 모자라면 화면 아래 끝에 맞춘다', () => {
    expect(placeBubble(anchor(100, 30), { w: 200, h: 590 }, { w: 1000, h: 600 }).y).toBe(8);
  });
});
