import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import { newState } from '../../../game/rules/logic';
import { QueryProvider } from '../../../core/QueryProvider';
import AdminApp from './AdminDashboard';

afterEach(cleanup);

describe('관리자 대시보드 페이지', () => {
  const openFish = () => {
    // 부팅 분기(main)와 같은 조립 — 관리자 화면은 읽기 캐시 아래에서 돈다
    render(<QueryProvider><AdminApp /></QueryProvider>);
    expect(screen.getByText('관리자 대시보드')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^스탯$/ })).not.toBeInTheDocument();
    expect(screen.queryByText('표면 위장')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '밸런스' }));
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

describe('관리자 대시보드 탐색', () => {
  const open = (hash: string) => {
    // 부팅 분기가 넘겨주는 주소를 그대로 흉내 낸다 — 해시는 주소창에서 온다
    window.history.replaceState(null, '', hash);
    render(<QueryProvider><AdminApp /></QueryProvider>);
  };
  const tabNames = () => within(screen.getByRole('navigation', { name: '대시보드 섹션' }))
    .getAllByRole('button').map(b => b.textContent?.trim());

  it('탭은 여섯 개다 — 개요 · 라이브 · 플레이어 · 경제·진행 · 밸런스 · 운영', () => {
    open('#/admin/overview');
    expect(tabNames()).toEqual(['개요', '라이브', '플레이어', '경제·진행', '밸런스', '운영']);
    expect(screen.getByRole('heading', { name: '개요' })).toBeInTheDocument();
  });

  it('옛 해시는 합친 탭의 구역으로 열리고 주소도 정식 해시로 바뀐다', () => {
    const cases: [string, string, string | null][] = [
      ['#/admin/users', '플레이어', '명부'],
      ['#/admin/letters', '플레이어', '편지'],
      ['#/admin/antiabuse', '플레이어', '이상탐지'],
      ['#/admin/metrics', '경제·진행', '활동'],
      ['#/admin/economy', '경제·진행', '경제'],
      ['#/admin/progression', '경제·진행', '진행'],
      ['#/admin/fish', '밸런스', null],
    ];
    for (const [old, title, section] of cases) {
      open(old);
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
      if (section) expect(screen.getByRole('button', { name: section, pressed: true })).toBeInTheDocument();
      expect(window.location.hash).not.toBe(old);
      cleanup();
    }
    open('#/admin/fish');
    expect(window.location.hash).toBe('#/admin/balance');
  });

  it('탭을 누르면 그 탭의 기본 구역 해시로 간다', () => {
    open('#/admin/overview');
    fireEvent.click(screen.getByRole('button', { name: '경제·진행' }));
    expect(window.location.hash).toBe('#/admin/analysis/economy');
    expect(screen.getByRole('heading', { name: '경제·진행' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '플레이어' }));
    expect(window.location.hash).toBe('#/admin/players/roster');
  });

  it('구역 탭을 누르면 해시가 구역까지 바뀐다', () => {
    open('#/admin/players');
    expect(window.location.hash).toBe('#/admin/players/roster');
    fireEvent.click(screen.getByRole('button', { name: '이상탐지' }));
    expect(window.location.hash).toBe('#/admin/players/abuse');
    expect(screen.getByRole('button', { name: '이상탐지', pressed: true })).toBeInTheDocument();
  });

  it('주소의 해시가 바뀌면 화면이 따라가고, 옛 해시도 새 자리로 옮긴다', async () => {
    open('#/admin/overview');
    act(() => { window.location.hash = '#/admin/antiabuse'; });
    await waitFor(() => expect(window.location.hash).toBe('#/admin/players/abuse'));
    expect(screen.getByRole('button', { name: '이상탐지', pressed: true })).toBeInTheDocument();
  });

  it('밸런스 탭에는 라이브 지표 구역이 비어 있는 채로 구분되어 있다', () => {
    open('#/admin/balance');
    expect(screen.getByRole('heading', { name: '라이브 지표' })).toBeInTheDocument();
    expect(screen.getByText(/라이브 지표는 아직 연결되지 않았어요/)).toBeInTheDocument();
    expect(screen.getAllByText('마리아나 해구').length).toBeGreaterThan(0);
  });
});
