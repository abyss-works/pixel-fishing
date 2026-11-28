import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { newState } from '../../../game/rules/logic';
import { powerReqOf } from '../../../game/content/spots';
import { QueryProvider } from '../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../features/admin/service/accessContext';
import AdminApp from './AdminDashboard';
import AdminWorkspace from './AdminWorkspace';

afterEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe('관리자 대시보드 페이지', () => {
  const openFish = async () => {
    render(<QueryProvider><AdminApp /></QueryProvider>);
    expect(await screen.findByText('픽셀 피싱 관리자')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^스탯$/ })).not.toBeInTheDocument();
    expect(screen.queryByText('표면 위장')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '지표·밸런스' }));
    fireEvent.click(screen.getByRole('tab', { name: '밸런스 시뮬' }));
    fireEvent.click(within(screen.getByRole('group', { name: '보기 모드' })).getByRole('button', { name: '상세' }));
    fireEvent.click(screen.getByRole('button', { name: '모두 펼치기' }));
  };

  it('어종 시뮬레이션 탭 — 수역별 표가 확정 데이터로 채워진다', async () => {
    await openFish();
    expect(screen.getAllByText('마리아나 해구').length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(`요구 파워 ${powerReqOf('deep')}`)).length).toBeGreaterThan(0);
  });

  it('기대값 띠가 어종 표 머리에 산다 — 축 5개와 Δ 열이 같은 프레임 안에', async () => {
    await openFish();
    expect(document.body.textContent).toMatch(/무판정/);
    expect(document.body.textContent).toMatch(/PERFECT/);
    expect(document.querySelectorAll('.pf-table td .pf-accent').length).toBeGreaterThan(10);
  });

  it('Δ 열은 사다리 보기에서 첫 행만 — 이고 나머지는 값을 가진다', async () => {
    await openFish();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/\+\d/).length).toBeGreaterThan(0);
  });

  it('지역 내 변화량 — 수동 사다리는 연쇄 %, 방치는 폭 하나(두 행에 개별 Δ 없음)', async () => {
    await openFish();
    expect(document.body.textContent).toMatch(/\+\d+%/);
    expect(document.body.textContent).toMatch(/폭 \+\d+%/);
  });

  it('신규 게임 상태와 무관한 확정 데이터 뷰다', () => {
    expect(newState().v).toBe(10);
  });
});

describe('관리자 대시보드 탐색', () => {
  const open = async (hash: string) => {
    window.history.replaceState(null, '', hash);
    render(<QueryProvider><AdminApp /></QueryProvider>);
    await screen.findByRole('navigation', { name: '대시보드 섹션' });
  };
  const tabNames = () => within(screen.getByRole('navigation', { name: '대시보드 섹션' }))
    .getAllByRole('tab').map(b => b.textContent?.trim());

  it('탭은 다섯 개다 — 현황 · 플레이어 · 소통·지급 · 지표·밸런스 · 운영·콘텐츠', async () => {
    await open('#/admin/overview/summary');
    expect(tabNames()).toEqual(['현황', '플레이어', '소통·지급', '지표·밸런스', '운영·콘텐츠']);
    expect(screen.getByRole('tab', { name: '현황', selected: true })).toBeInTheDocument();
  });

  it('모르는 해시는 현황 요약으로 열리고 주소도 정식 해시로 바뀐다', async () => {
    await open('#/admin/users');
    expect(screen.getByRole('tab', { name: '현황', selected: true })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/admin/overview/summary');
  });

  it('구 8탭 해시(#/admin/balance, #/admin/content, #/admin/live)는 5탭 경로로 호환 리다이렉트된다', async () => {
    await open('#/admin/content');
    expect(window.location.hash).toBe('#/admin/ops/catalog');
    expect(screen.getByRole('tablist', { name: '콘텐츠 축' })).toBeInTheDocument();
  });

  it('탭을 누르면 그 탭의 기본 구역 해시로 간다', async () => {
    await open('#/admin/overview/summary');
    fireEvent.click(screen.getByRole('tab', { name: '지표·밸런스' }));
    expect(window.location.hash).toBe('#/admin/insights/economy');
    expect(screen.getByRole('tab', { name: '지표·밸런스', selected: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '플레이어' }));
    expect(window.location.hash).toBe('#/admin/players/directory');
    fireEvent.click(screen.getByRole('tab', { name: '소통·지급' }));
    expect(window.location.hash).toBe('#/admin/comms/mail');
    expect(screen.getByRole('tab', { name: '소통·지급', selected: true })).toBeInTheDocument();
  });

  it('구역 탭을 누르면 해시가 구역까지 바뀐다', async () => {
    await open('#/admin/players');
    expect(window.location.hash).toBe('#/admin/players/directory');
    fireEvent.click(screen.getByRole('tab', { name: '제재·무결성' }));
    expect(window.location.hash).toBe('#/admin/players/sanctions');
    expect(screen.getByRole('tab', { name: '제재·무결성', selected: true })).toBeInTheDocument();
  });

  it('주소의 해시가 바뀌면 화면이 따라간다', async () => {
    await open('#/admin/overview/summary');
    act(() => { window.location.hash = '#/admin/players/sanctions'; });
    await waitFor(() => expect(window.location.hash).toBe('#/admin/players/sanctions'));
    expect(screen.getByRole('tab', { name: '제재·무결성', selected: true })).toBeInTheDocument();
  });

  it('상단 요약 / 상세 토글은 기본값 요약이고 sessionStorage에 유지된다', async () => {
    await open('#/admin/overview/summary');
    const viewGroup = screen.getByRole('group', { name: '보기 모드' });
    const summaryBtn = within(viewGroup).getByRole('button', { name: '요약' });
    const detailBtn = within(viewGroup).getByRole('button', { name: '상세' });
    expect(summaryBtn).toHaveAttribute('aria-pressed', 'true');
    expect(detailBtn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/즉시 처리 큐/)).toBeInTheDocument();

    fireEvent.click(detailBtn);
    expect(detailBtn).toHaveAttribute('aria-pressed', 'true');
    expect(sessionStorage.getItem('pf_admin_view_mode')).toBe('detail');
    expect(screen.getByRole('heading', { name: '최근 이벤트 피드' })).toBeInTheDocument();
  });

  it('게이트는 내용을 교체하지 않는다 — 로컬 모드 배너와 현황의 빈 골격이 함께 보인다', async () => {
    await open('#/admin/overview/summary');
    expect(await screen.findByText('로컬 모드예요. 클라우드가 설정되어 있지 않아요.')).toBeInTheDocument();
    expect(screen.getByText('지금 접속')).toBeInTheDocument();
    expect(screen.getAllByText('운영 DB에 연결하면 채워져요.').length).toBeGreaterThan(0);
    const refreshBtn = screen.getByRole('button', { name: '현재 탭 새로고침' });
    expect(refreshBtn).toHaveAttribute('title', '마지막 조회 —');
    expect(refreshBtn).toBeDisabled();
  });
});

describe('운영자(maintainer) 공통 대시보드 통합', () => {
  it('maintainer도 동일한 5탭 공통 대시보드(검색·명부, 우편 발송, 편지 포함)를 사용한다', async () => {
    const setStaffBadge = vi.fn(async () => {});
    window.history.replaceState(null, '', '#/admin/comms/mail');
    render(
      <QueryProvider>
        <AdminAuthCtx.Provider value={{
          access: 'granted',
          uid: 'maintainer-1',
          role: 'maintainer',
          canViewEmail: false,
          showStaffBadge: false,
          setStaffBadge,
        }}>
          <AdminWorkspace />
        </AdminAuthCtx.Provider>
      </QueryProvider>,
    );

    expect(screen.getByText('픽셀 피싱 관리자')).toBeInTheDocument();
    expect(screen.getByText('운영자')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/admin/comms/mail');
    expect(screen.getByRole('tab', { name: '우편 발송' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '공지' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '쿠폰' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '편지' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '플레이어' }));
    expect(window.location.hash).toBe('#/admin/players/directory');
    expect(screen.getByRole('tab', { name: '검색·명부' })).toBeInTheDocument();

    const badgeBtn = screen.getByRole('button', { name: '채팅 운영진 별 표기' });
    fireEvent.click(badgeBtn);
    await waitFor(() => expect(setStaffBadge).toHaveBeenCalledWith(true));
  });
});
