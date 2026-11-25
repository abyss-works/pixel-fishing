import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ItemBadge from './ItemBadge';

afterEach(cleanup);

describe('ItemBadge', () => {
  it('비약은 픽셀 스프라이트와 이름, 수량을 함께 표시한다', () => {
    const { container } = render(<ItemBadge id="luck-small" qty={2} />);
    expect(screen.getByText('작은 바다 영약')).toBeTruthy();
    expect(screen.getByText('×2')).toBeTruthy();
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('재료는 보석 픽셀 아이콘과 이름, 수량을 표시한다', () => {
    const { container } = render(<ItemBadge id="mat-abyss-lantern" qty={5} />);
    expect(screen.getByText('돌이 된 이빨')).toBeTruthy();
    expect(screen.getByText('×5')).toBeTruthy();
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('미등록 id도 식별자와 수량을 안전하게 표시한다', () => {
    render(<ItemBadge id="unknown-item" qty={1000} />);
    expect(screen.getByText('unknown-item')).toBeTruthy();
    expect(screen.getByText('×1,000')).toBeTruthy();
  });
});
