import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import ProgressCount from './ProgressCount';

afterEach(cleanup);

describe('ProgressCount', () => {
  it('진척도 기본값(a / b)은 현재값과 기준 분모를 구분해 렌더한다', () => {
    const { container } = render(<ProgressCount current={1250} target={5000} />);
    const root = container.querySelector('[data-progress-count]') as HTMLElement;
    expect(root).toHaveAttribute('data-tone', 'gold');
    expect(root.textContent).toBe('1,250 / 5,000');
    expect(root.querySelector('[data-progress-current]')?.textContent).toBe('1,250');
    expect(root.querySelector('[data-progress-target]')?.textContent).toBe(' / 5,000');
  });

  it('퍼센트와 tight 표기, 분모 접두·접미 문구를 함께 지원한다', () => {
    const { container, rerender } = render(<ProgressCount current={42} target={90} percent={47} />);
    let root = container.querySelector('[data-progress-count]') as HTMLElement;
    expect(root.textContent).toBe('42 / 90 (47%)');
    expect(root.querySelector('[data-progress-current]')?.textContent).toBe('42');
    expect(root.querySelector('[data-progress-target]')?.textContent).toBe(' / 90');
    expect(root.querySelector('[data-progress-percent]')?.textContent).toBe('(47%)');

    rerender(<ProgressCount current={2} target={8} tight suffix=" 완결" />);
    root = container.querySelector('[data-progress-count]') as HTMLElement;
    expect(root.textContent).toBe('2/8 완결');

    rerender(<ProgressCount current={40} target={60} targetPrefix="요구 " tone="danger" />);
    root = container.querySelector('[data-progress-count]') as HTMLElement;
    expect(root).toHaveAttribute('data-tone', 'danger');
    expect(root.textContent).toBe('40 / 요구 60');
    expect(root.querySelector('[data-progress-target]')?.textContent).toBe(' / 요구 60');
  });

  it('현재값이 null이면 - 만 표시한다', () => {
    const { container } = render(<ProgressCount current={null} target={5} tight />);
    const root = container.querySelector('[data-progress-count]') as HTMLElement;
    expect(root).toHaveAttribute('data-tone', 'dim');
    expect(root.textContent).toBe('-');
    expect(root.querySelector('[data-progress-target]')).toBeNull();
  });

  it('단일 핵심 수치와 의도적 의미 색(tone)을 지원한다', () => {
    const { container, rerender } = render(<ProgressCount value={1200} />);
    let root = container.querySelector('[data-progress-count]') as HTMLElement;
    expect(root).toHaveAttribute('data-tone', 'gold');
    expect(root.textContent).toBe('1,200');
    expect(root.querySelector('[data-progress-current]')?.textContent).toBe('1,200');

    rerender(<ProgressCount current={1} target={10} tone="guild" />);
    root = container.querySelector('[data-progress-count]') as HTMLElement;
    expect(root).toHaveAttribute('data-tone', 'guild');
    expect(root.textContent).toBe('1 / 10');
  });
});
