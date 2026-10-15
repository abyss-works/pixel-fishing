import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CostLine from './CostLine';

afterEach(cleanup);

describe('CostLine', () => {
  it('지출 — 보유 → 확정 후를 천 단위로 보이고 모자라면 위험색', () => {
    render(<CostLine have={1200} delta={-800} />);
    expect(screen.getByText('1,200G')).toBeInTheDocument();
    expect(screen.getByText('400G')).toHaveClass('text-gold');
    expect(screen.getByText('(-800G)')).toBeInTheDocument();
    cleanup();
    render(<CostLine have={500} delta={-800} />);
    expect(screen.getByText('-300G')).toHaveClass('text-danger');
  });

  it('수입과 하한 조건 — 명성이 모자라면 보유 명성만 위험색', () => {
    render(<CostLine have={100} delta={60} requirement={{ label: '명성', need: 1000, have: 400 }} />);
    expect(screen.getByText('(+60G)')).toBeInTheDocument();
    expect(screen.getByText('400')).toHaveClass('text-danger');
    expect(screen.getByText('1,000')).not.toHaveClass('text-danger');
  });
});
