// 대시보드 막대 차트의 값→높이 대응과 강조·눈금 규칙을 고정한다.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BarsChart } from './charts';

afterEach(cleanup);

/** 막대 하나의 감싸개(title을 가진 칸)와 그 안의 막대 요소 */
const bars = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[title]')].map(wrap => wrap.firstElementChild as HTMLElement);

const heights = (root: HTMLElement) => bars(root).map(bar => bar.style.height);

describe('막대 차트', () => {
  it('높이는 최댓값 대비 비율이고, 양수는 최소 4px · 0은 1px 선이다', () => {
    const { container } = render(<BarsChart values={[0, 1, 50, 100]} height={100} ariaLabel="시험" />);
    expect(heights(container)).toEqual(['1px', '4px', '50px', '100px']);
  });

  it('max를 주면 그 상한을 기준으로 높이를 정한다', () => {
    const { container } = render(<BarsChart values={[25, 100]} max={100} height={40} ariaLabel="시험" />);
    expect(heights(container)).toEqual(['10px', '40px']);
  });

  it('유한하지 않은 값은 미집계 칸으로 비워 두고 0과 구분한다', () => {
    const { container } = render(<BarsChart values={[NaN, 0, 10]} labels={['a', 'b', 'c']} height={20} ariaLabel="시험" />);
    expect(heights(container)).toEqual(['0px', '1px', '20px']);
    expect(bars(container)[0]).not.toHaveClass('bg-line');
    expect(container.querySelector('[title]')?.getAttribute('title')).toBe('a: 미집계');
  });

  it('차트의 접근성 이름과 막대별 title(이름: 값)을 가진다', () => {
    const { container } = render(
      <BarsChart values={[3, 12000]} labels={['10-01', '10-02']} ariaLabel="일별 낚시 추이" />);
    expect(screen.getByRole('img', { name: '일별 낚시 추이' })).toBeInTheDocument();
    expect([...container.querySelectorAll('[title]')].map(el => el.getAttribute('title')))
      .toEqual(['10-01: 3', '10-02: 1.2만']);
  });

  it('last 강조는 맨 오른쪽 막대를 골드로 세우고 값을 윗줄에 적는다', () => {
    const { container } = render(
      <BarsChart values={[1, 2, 3]} labels={['a', 'b', 'c']} highlight="last" highlightName="금일" ariaLabel="시험" />);
    const [first, , last] = bars(container);
    expect(last).toHaveClass('border-gold');
    expect(first).toHaveClass('border-text-dim');
    expect(screen.getByText('금일', { exact: false }).textContent).toContain('3');
  });

  it('peak 강조는 가장 큰 값의 막대를 고르고, 값이 모두 0이면 강조하지 않는다', () => {
    const peak = render(<BarsChart values={[1, 9, 4]} labels={['a', 'b', 'c']} highlight="peak" ariaLabel="시험" />);
    expect(bars(peak.container).map(bar => bar.classList.contains('border-gold'))).toEqual([false, true, false]);
    cleanup();
    const none = render(<BarsChart values={[0, 0]} highlight="peak" ariaLabel="시험" />);
    expect(bars(none.container).some(bar => bar.classList.contains('border-gold'))).toBe(false);
  });

  it('눈금 글자는 막대가 많으면 일정 간격으로 고른다', () => {
    const labels = Array.from({ length: 30 }, (_, i) => `d${i}`);
    const { container } = render(<BarsChart values={labels.map(() => 1)} labels={labels} ariaLabel="시험" />);
    const ticks = [...container.querySelectorAll('[aria-hidden="true"].relative span')].map(el => el.textContent);
    expect(ticks).toEqual(['d0', 'd5', 'd10', 'd15', 'd20', 'd25']);
  });
});
