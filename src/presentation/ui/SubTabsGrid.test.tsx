import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SubTabsGrid from './SubTabsGrid';

const items = [
  { key: 'a', label: '가', sub: '1/2' },
  { key: 'b', label: '나' },
  { key: 'c', label: '다' },
];

describe('같은 폭 서브탭', () => {
  afterEach(cleanup);

  it('고른 칸만 완전 강조(골드)이고 나머지는 일반 켜짐(선 색)이다', () => {
    render(<SubTabsGrid items={items} activeKey="b" onSelect={() => {}} />);
    const tab = (name: RegExp) => screen.getByRole('button', { name });
    expect(tab(/나/)).toHaveAttribute('aria-pressed', 'true');
    expect(tab(/나/)).toHaveClass('border-gold', 'text-gold');
    expect(tab(/가/)).toHaveAttribute('aria-pressed', 'false');
    expect(tab(/가/)).toHaveClass('border-line', 'text-text');
    expect(tab(/가/)).not.toHaveClass('text-gold');
  });

  it('칸을 누르면 그 키로 onSelect를 부르고, 보조 줄은 이름과 함께 그린다', () => {
    const onSelect = vi.fn();
    render(<SubTabsGrid items={items} activeKey="a" onSelect={onSelect} />);
    expect(screen.getByText('1/2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다' }));
    expect(onSelect).toHaveBeenCalledWith('c');
  });

  it('가로 스크롤 칸을 두지 않는다', () => {
    const { container } = render(<SubTabsGrid items={items} activeKey="a" onSelect={() => {}} />);
    expect(container.querySelector('[class*="overflow-x"]')).toBeNull();
  });
});
