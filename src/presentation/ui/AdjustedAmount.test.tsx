import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AdjustedAmount from './AdjustedAmount';

afterEach(cleanup);

describe('AdjustedAmount', () => {
  it('보정이 없으면 금액 하나만 보이고 취소선과 툴팁이 없다', () => {
    const { container } = render(<AdjustedAmount amount={{ base: 1000, mods: [], value: 1000 }} />);
    expect(container.textContent).toBe('1,000G');
    expect(container.querySelector('s')).toBeNull();
    fireEvent.mouseEnter(screen.getByText('1,000G'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('보정이 있으면 원본에 취소선, 보정 금액을 옆에 보이고 툴팁에 기본 금액·사유별 증감·합계를 싣는다', () => {
    const { container } = render(
      <AdjustedAmount amount={{ base: 1000, mods: [{ id: 'relic', label: '마미 와타의 거울', delta: -300 }], value: 700 }} />,
    );
    expect(container.querySelector('s')?.textContent).toBe('1,000G');
    expect(container.textContent).toBe('1,000G700G');
    fireEvent.mouseEnter(screen.getByText('700G'));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('기본 금액1,000G');
    expect(tip).toHaveTextContent('마미 와타의 거울−300G');
    expect(tip).toHaveTextContent('합계700G');
  });

  it('접근성 이름에 기본 금액, 사유별 증감, 합계가 읽힌다', () => {
    render(<AdjustedAmount amount={{ base: 1000, mods: [{ id: 'relic', label: '마미 와타의 거울', delta: -300 }], value: 700 }} />);
    expect(screen.getByLabelText('기본 금액 1,000G, 마미 와타의 거울 −300G, 합계 700G')).toBeInTheDocument();
  });

  it('버튼 안(inButton)에서는 포커스 칸이 없고 호버로만 열린다', () => {
    const amount = { base: 1000, mods: [{ id: 'g', label: '판매가 보너스', delta: 60 }], value: 1060 };
    render(<button type="button">판매 (+<AdjustedAmount amount={amount} inButton />)</button>);
    expect(document.querySelector('[tabindex]')).toBeNull();
    expect(screen.getByRole('button', { name: /^판매 \(\+기본 금액 1,000G, 판매가 보너스 \+60G, 합계 1,060G\)$/ })).toBeInTheDocument();
    fireEvent.mouseEnter(document.querySelector('button span span')!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('합계1,060G');
  });

  it('증가분은 + 부호로 보인다', () => {
    render(<AdjustedAmount amount={{ base: 1000, mods: [{ id: 'guild-sell', label: '판매가 보너스', delta: 60 }], value: 1060 }} />);
    fireEvent.mouseEnter(screen.getByText('1,060G'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('판매가 보너스+60G');
  });

  it('증감이 모두 0이면 보정이 없는 것으로 본다', () => {
    const { container } = render(<AdjustedAmount amount={{ base: 500, mods: [{ id: 'x', label: 'x', delta: 0 }], value: 500 }} />);
    expect(container.textContent).toBe('500G');
  });
});
