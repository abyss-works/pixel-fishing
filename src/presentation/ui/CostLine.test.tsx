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

  it('좁은 폭에서 값이 한 줄에 안 들어가면 "→ 확정 후 값" 묶음이 내려가도록 값 줄이 줄 바꿈을 허용하고 각 값은 한 줄로 둔다', () => {
    render(<CostLine have={1_000_000_000} delta={-12_500_000} />);
    const have = screen.getByText('1,000,000,000G');
    const row = have.parentElement as HTMLElement;
    expect(row.className).toContain('flex-wrap');
    expect(row.className).toContain('min-w-0');
    expect(have).toHaveClass('whitespace-nowrap');
    expect(screen.getByText('987,500,000G').parentElement).toHaveClass('whitespace-nowrap');
    expect(screen.getByText('골드')).toHaveClass('shrink-0');
  });
});
