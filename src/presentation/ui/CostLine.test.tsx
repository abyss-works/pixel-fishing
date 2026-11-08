import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CostLine from './CostLine';

afterEach(cleanup);

describe('CostLine', () => {
  it('지출 — 골드 줄에 보유 → 확정 후를 천 단위로 보이고 모자라면 위험색', () => {
    render(<CostLine have={1200} delta={-800} />);
    expect(screen.getByText('골드')).toBeInTheDocument();
    expect(screen.getByText('1,200G')).toBeInTheDocument();
    expect(screen.getByText('400G')).not.toHaveClass('text-danger');
    cleanup();
    render(<CostLine have={500} delta={-800} />);
    expect(screen.getByText('-300G')).toHaveClass('text-danger');
  });

  it('수입과 하한 조건 — 명성이 모자라면 보유 명성만 위험색', () => {
    render(<CostLine have={100} delta={60} requirement={{ label: '명성', need: 1000, have: 400 }} />);
    expect(screen.getByText('160G')).toBeInTheDocument();
    expect(screen.getByText('명성')).toBeInTheDocument();
    expect(screen.getByText('400')).toHaveClass('text-danger');
    expect(screen.getByText('1,000')).not.toHaveClass('text-danger');
  });

  it('다른 재화는 이름과 값 표기를 바꿔 쓴다 - 재료 3개에서 1개를 쓰면 3 → 2', () => {
    render(<CostLine have={3} delta={-1} label="이끼 낀 나침반" format={String} />);
    expect(screen.getByText('이끼 낀 나침반')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).not.toHaveClass('text-danger');
    cleanup();
    render(<CostLine have={0} delta={-1} label="재료" format={String} />);
    expect(screen.getByText('-1')).toHaveClass('text-danger');
  });
});
