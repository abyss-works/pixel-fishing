// 운영 탭 — 환경 정체·권한 상태·이벤트 카탈로그가 칸으로 나뉘어 그려지는지 확인한다.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import type { AdminAccess } from '../../../../features/admin/service/accessContext';
import type { AdminRole } from '../../../../features/admin/model/types';
import { EVENT_LABELS, todayKST } from '../../../../features/admin/model/metrics';
import { QueryProvider } from '../../../../core/QueryProvider';
import { api } from '../../../../platform/api';
import OpsTab from './OpsTab';

const sampleHttpMetrics = (days = 30) => ({
  days,
  scope: 'app_server' as const,
  summary: { total: 500, status426: 1, status429: 10, status5xx: 2, rate426: 0.002, rate429: 0.02, rate5xx: 0.004 },
  daily: [{ day: todayKST(), total: 500, status426: 1, status429: 10, status5xx: 2, rate426: 0.002, rate429: 0.02, rate5xx: 0.004 }],
  byRoute: [{ routeGroup: 'action' as const, total: 400, status426: 1, status429: 8, status5xx: 2, rate426: 0.0025, rate429: 0.02, rate5xx: 0.005 }],
  rows: [{ day: todayKST(), routeGroup: 'action' as const, total: 400, status426: 1, status429: 8, status5xx: 2 }],
});

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      deployHost: () => null,
      changelog: vi.fn(async () => []),
      httpMetrics: vi.fn(async (days = 30) => sampleHttpMetrics(days)),
    },
  },
}));

afterEach(cleanup);

const show = (access: AdminAccess, role: AdminRole = 'admin') => render(
  <QueryProvider><AdminAuthCtx.Provider value={{ access, uid: null, role, showStaffBadge: false, setStaffBadge: async () => {} }}><OpsTab /></AdminAuthCtx.Provider></QueryProvider>,
);

describe('운영 탭', () => {
  it('환경 정체를 표로, 권한 상태를 칸 하나로 보인다', () => {
    show('local');
    const identity = screen.getByText('이 화면의 정체').closest('section')!;
    expect(within(identity).getByText('릴리즈 버전')).toBeInTheDocument();
    expect(within(identity).getByText('빌드 식별자')).toBeInTheDocument();
    expect(within(identity).getByText('로컬 모드')).toBeInTheDocument(); // 붙은 서버가 없다
    const auth = screen.getByText('권한').closest('section')!;
    expect(within(auth).getByText(/로컬 모드에서는 관리자 데이터가 없어요/)).toBeInTheDocument();
  });

  it('관리자 세션과 운영자 세션의 권한 문구를 역할별로 보인다', () => {
    show('granted', 'admin');
    expect(screen.getByText('관리자 세션')).toBeInTheDocument();
    cleanup();
    show('granted', 'maintainer');
    expect(screen.getByText('운영자 세션')).toBeInTheDocument();
  });

  it('변경 기록 칸이 있다', () => {
    show('granted');
    expect(screen.getByText('변경 기록')).toBeInTheDocument();
  });

  it('이벤트 카탈로그는 이벤트 유형마다 한 줄이고, 이벤트를 남기지 않는 액션을 따로 적는다', () => {
    show('granted');
    const catalog = screen.getByText('events 스트림 카탈로그').closest('section')!;
    for (const [type, label] of Object.entries(EVENT_LABELS)) {
      const row = within(catalog).getByText(type).closest('tr')!;
      expect(within(row).getByText(label)).toBeInTheDocument();
    }
    expect(within(catalog).getByText(/이벤트를 남기지 않아요/)).toBeInTheDocument();
    for (const type of ['adminRestrict', 'adminUnrestrict', 'adminResetLink', 'adminRevokeSessions']) {
      expect(within(catalog).getByText(type)).toBeInTheDocument();
    }
    const contract = screen.getByText('데이터 계약').closest('section')!;
    expect(within(contract).getByText(/세션 강제 종료/)).toBeInTheDocument();
  });

  it('maintainer 역할의 데이터 계약은 기간제 공지·채팅 별 표기 토글·비식별 지표 열람과 감사 로그 기록만 안내한다', () => {
    show('granted', 'maintainer');
    const contract = screen.getByText('데이터 계약').closest('section')!;
    expect(within(contract).getByText(/비식별 운영 지표/)).toBeInTheDocument();
    expect(within(contract).getByText(/기간제 공지/)).toBeInTheDocument();
    expect(within(contract).getByText(/채팅 운영진 별 표기 토글/)).toBeInTheDocument();
    expect(within(contract).getByText(/감사 로그/)).toBeInTheDocument();
    expect(within(contract).queryByText(/우편 보내기/)).toBeNull();
    expect(within(contract).queryByText(/세션 강제 종료/)).toBeNull();
  });

  it('HTTP 오류율·429 섹션은 앱 서버 기준 안내·경로 묶음 표·일별 추이와 기간 전환(7/30/90일)을 제공한다', async () => {
    show('granted');
    expect(await screen.findByText('게임 액션')).toBeInTheDocument();
    expect(screen.getByText(/ingress-nginx/)).toBeInTheDocument();
    expect(vi.mocked(api.admin.httpMetrics)).toHaveBeenCalledWith(30);
    expect(screen.getByRole('img', { name: '최근 30일 일별 429 응답 수' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '최근 30일 일별 5xx 오류 수' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '7일' }));
    await waitFor(() => expect(vi.mocked(api.admin.httpMetrics)).toHaveBeenCalledWith(7));
    expect(screen.getByRole('img', { name: '최근 7일 일별 429 응답 수' })).toBeInTheDocument();
  });
});
