// 크기 막대 — 연속 채움 규칙과 "금색 = 월척" 일치 검증
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SizeBar from './SizeBar';
import { BIG_CATCH_PERCENTILE } from '../game/balance';

afterEach(cleanup);

const fill = (percentile: number) => {
  const { container } = render(<SizeBar percentile={percentile} />);
  return container.querySelector('[data-filled]') as HTMLElement | null;
};

describe('SizeBar', () => {
  it('채움 = 100 - 백분위 — 0.1% 단위가 그대로 반영된다', () => {
    expect(fill(40)?.style.width).toBe('60%');
    expect(fill(40.4)?.style.width).toBe('59.6%'); // 칸으로 끊으면 사라지는 차이
    expect(fill(40.5)?.style.width).toBe('59.5%');
  });

  it('색은 트랙 전체 기준 — 채운 만큼만 잘라 보여준다', () => {
    // background-size를 트랙 폭까지 키워야 같은 색이 항상 같은 크기를 뜻한다
    expect(fill(50)?.style.backgroundSize).toBe('200% 100%'); // 50% 채움 → 2배
    expect(fill(0)?.style.backgroundSize).toBe('100% 100%');  // 꽉 참 → 1배
  });

  it('금색 구간에 닿는 조건이 월척 판정과 같다', () => {
    // 마지막 20%가 금색이므로 "닿는다" = 채움 >= 80 = 백분위 <= 20 = isBig
    const atEdge = 100 - Number(fill(BIG_CATCH_PERCENTILE)?.dataset.filled);
    expect(atEdge).toBe(BIG_CATCH_PERCENTILE);
    expect(Number(fill(BIG_CATCH_PERCENTILE)?.dataset.filled)).toBe(100 - BIG_CATCH_PERCENTILE);
    expect(Number(fill(BIG_CATCH_PERCENTILE + 0.1)?.dataset.filled))
      .toBeLessThan(100 - BIG_CATCH_PERCENTILE);
  });

  it('채울 게 없으면 아무것도 그리지 않는다', () => {
    expect(fill(100)).toBeNull();
  });

  it('장식이라 스크린리더에 읽히지 않는다 — 숫자는 옆 칸이 말한다', () => {
    const { container } = render(<SizeBar percentile={10} />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
