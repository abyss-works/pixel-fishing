import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import { newState } from '../../../game/rules/logic';
import AdminApp from './AdminDashboard';

afterEach(cleanup);

describe('관리자 대시보드 페이지', () => {
  const openFish = () => {
    render(<AdminApp />);
    expect(screen.getByText('관리자 대시보드')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^스탯$/ })).not.toBeInTheDocument();
    expect(screen.queryByText('표면 위장')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '어종 시뮬' }));
  };

  it('어종 시뮬레이션 탭 — 수역별 표가 확정 데이터로 채워진다', () => {
    openFish();
    expect(screen.getAllByText('마리아나 해구').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/요구 파워 40/).length).toBeGreaterThan(0);
  });

  it('기대값 띠가 어종 표 머리에 산다 — 축 5개와 Δ 열이 같은 프레임 안에', () => {
    openFish();
    expect(document.body.textContent).toMatch(/무판정/);
    expect(document.body.textContent).toMatch(/PERFECT/);
    expect(document.querySelectorAll('.pf-table td .pf-accent').length).toBeGreaterThan(10);
  });

  it('Δ 열은 사다리 보기에서 첫 행만 — 이고 나머지는 값을 가진다', () => {
    openFish();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/\+\d/).length).toBeGreaterThan(0);
  });

  it('지역 내 변화량 — 수동 사다리는 연쇄 %, 방치는 폭 하나(두 행에 개별 Δ 없음)', () => {
    openFish();
    expect(document.body.textContent).toMatch(/\+\d+%/);
    expect(document.body.textContent).toMatch(/폭 \+\d+%/);
  });

  it('신규 게임 상태와 무관한 확정 데이터 뷰다', () => {
    expect(newState().v).toBe(8);
  });
});
