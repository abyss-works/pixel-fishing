// 픽셀 아이콘 — 운영진 5각 별 2종(관리자 큰 별 · 운영자 작은 별)의 실루엣과 크기 차이를 검증한다.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PixelIcon from './PixelIcon';

afterEach(cleanup);

function rectBounds(svg: SVGSVGElement) {
  const rects = [...svg.querySelectorAll('rect')].map(r => ({
    x: Number(r.getAttribute('x')),
    y: Number(r.getAttribute('y')),
    w: Number(r.getAttribute('width')),
    h: Number(r.getAttribute('height')),
  }));
  const minX = Math.min(...rects.map(r => r.x));
  const maxX = Math.max(...rects.map(r => r.x + r.w));
  const minY = Math.min(...rects.map(r => r.y));
  const maxY = Math.max(...rects.map(r => r.y + r.h));
  const area = rects.reduce((sum, r) => sum + r.w * r.h, 0);
  return { rects, width: maxX - minX, height: maxY - minY, area };
}

describe('PixelIcon 운영진 5각 별', () => {
  it('관리자 큰 별과 운영자 작은 별은 12×12 그리드 안에서 5각 실루엣과 분명한 크기 차이를 가진다', () => {
    const { container } = render(
      <>
        <PixelIcon glyph="staffStarLarge" size={12} />
        <PixelIcon glyph="staffStarSmall" size={12} />
      </>,
    );
    const large = container.querySelector('svg[data-glyph="staffStarLarge"]') as SVGSVGElement;
    const small = container.querySelector('svg[data-glyph="staffStarSmall"]') as SVGSVGElement;
    expect(large).not.toBeNull();
    expect(small).not.toBeNull();

    const largeBounds = rectBounds(large);
    const smallBounds = rectBounds(small);
    expect(largeBounds.width).toBe(12);
    expect(largeBounds.height).toBe(11);
    expect(smallBounds.width).toBe(8);
    expect(smallBounds.height).toBe(8);
    expect(largeBounds.area).toBeGreaterThan(smallBounds.area * 1.8);
    // 하단 두 다리 갈라짐(마지막 두 줄에 각각 좌·우 rect 2개)으로 5각 별 실루엣 확인
    expect(largeBounds.rects.filter(r => r.y >= 8)).toHaveLength(6);
    expect(smallBounds.rects.filter(r => r.y >= 8)).toHaveLength(4);
  });
});
