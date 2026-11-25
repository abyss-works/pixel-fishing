import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ScrollRow from './ScrollRow';

afterEach(cleanup);

function mockMetrics(el: HTMLElement, { clientWidth, scrollWidth, scrollLeft }: { clientWidth: number; scrollWidth: number; scrollLeft: number }) {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'scrollLeft', { configurable: true, value: scrollLeft });
}

describe('가로 스크롤 줄 (ScrollRow)', () => {
  it('내용이 넘치지 않으면 좌우 화살표 버튼과 좌우 여백을 그리지 않는다', () => {
    const { container } = render(
      <ScrollRow>
        <span>항목</span>
      </ScrollRow>,
    );
    expect(screen.queryByRole('button', { name: '이전' })).toBeNull();
    expect(screen.queryByRole('button', { name: '다음' })).toBeNull();
    const root = container.firstElementChild!;
    expect(root.className).not.toMatch(/\b(?:px|pl|pr)-4\b/);
  });

  it('내용이 넘치면 스크롤 위치에 따라 이전/다음 화살표와 해당 방향 여백만 조건부 렌더링한다', () => {
    const orig = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const origScrollW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
    const origScrollL = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollLeft');
    try {
      const { container, rerender } = render(
        <ScrollRow>
          <span>긴 항목 1</span>
          <span>긴 항목 2</span>
        </ScrollRow>,
      );
      const root = container.firstElementChild!;
      const track = root.querySelector('.pf-scroll') as HTMLElement;

      // 왼쪽 끝(시작) — 다음 화살표와 pr-4만
      mockMetrics(track, { clientWidth: 100, scrollWidth: 300, scrollLeft: 0 });
      fireEvent.scroll(track);
      expect(screen.queryByRole('button', { name: '이전' })).toBeNull();
      expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
      expect(root.className).not.toContain('pl-4');
      expect(root.className).toContain('pr-4');

      // 중간 — 이전/다음 모두 + pl-4/pr-4
      mockMetrics(track, { clientWidth: 100, scrollWidth: 300, scrollLeft: 60 });
      fireEvent.scroll(track);
      expect(screen.getByRole('button', { name: '이전' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
      expect(root.className).toContain('pl-4');
      expect(root.className).toContain('pr-4');

      // 오른쪽 끝 — 이전 화살표와 pl-4만
      mockMetrics(track, { clientWidth: 100, scrollWidth: 300, scrollLeft: 200 });
      fireEvent.scroll(track);
      expect(screen.getByRole('button', { name: '이전' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '다음' })).toBeNull();
      expect(root.className).toContain('pl-4');
      expect(root.className).not.toContain('pr-4');

      // 다시 넘치지 않게 되면 모두 사라짐
      mockMetrics(track, { clientWidth: 300, scrollWidth: 300, scrollLeft: 0 });
      rerender(<ScrollRow><span>짧은 항목</span></ScrollRow>);
      fireEvent.scroll(track);
      expect(screen.queryByRole('button', { name: '이전' })).toBeNull();
      expect(screen.queryByRole('button', { name: '다음' })).toBeNull();
    } finally {
      if (orig) Object.defineProperty(HTMLElement.prototype, 'clientWidth', orig);
      if (origScrollW) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', origScrollW);
      if (origScrollL) Object.defineProperty(HTMLElement.prototype, 'scrollLeft', origScrollL);
    }
  });
});
