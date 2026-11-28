// 운영 탭 — 환경 정체·권한 상태·이벤트 카탈로그가 칸으로 나뉘어 그려지는지 확인한다.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { AdminAuthCtx } from '../../../../features/admin/service/accessContext';
import type { AdminAccess } from '../../../../features/admin/service/accessContext';
import type { AdminRole } from '../../../../features/admin/model/types';
import { EVENT_LABELS, todayKST } from '../../../../features/admin/model/metrics';
import { QueryProvider } from '../../../../core/QueryProvider';
import { api } from '../../../../platform/api';
import type { OpsSection } from '../routes';
import { AdminViewModeCtx } from '../viewMode';
import OpsTab from './OpsTab';

const sampleHttpMetrics = (days = 30) => ({
  days,
  scope: 'app_server' as const,
  summary: {
    total: 500,
    status409: 3,
    status426: 1,
    status429: 10,
    status4xx: 20,
    status5xx: 2,
    rate409: 0.006,
    rate426: 0.002,
    rate429: 0.02,
    rate4xx: 0.04,
    rate5xx: 0.004,
    latency: { p50Ms: 22, p95Ms: 140, p99Ms: 310, avgMs: 45, samples: 480 },
    rateLimitReasons: { catchTooSoon: 6, letterGap: 3, other: 1 },
  },
  daily: [{ day: todayKST(), total: 500, status426: 1, status429: 10, status5xx: 2, rate426: 0.002, rate429: 0.02, rate5xx: 0.004 }],
  byRoute: [{
    routeGroup: 'action' as const,
    total: 400,
    status409: 3,
    status426: 1,
    status429: 8,
    status4xx: 16,
    status5xx: 2,
    rate409: 0.0075,
    rate426: 0.0025,
    rate429: 0.02,
    rate4xx: 0.04,
    rate5xx: 0.005,
    latency: { p50Ms: 20, p95Ms: 130, p99Ms: 290, avgMs: 40, samples: 390 },
  }],
  rows: [{ day: todayKST(), routeGroup: 'action' as const, total: 400, status426: 1, status429: 8, status5xx: 2 }],
});

const sampleOpsHealth = () => ({
  runtime: { uptimeSec: 3600, rssMb: 200, heapUsedMb: 100, heapTotalMb: 150 },
  database: { poolTotal: 5, poolIdle: 4, poolWaiting: 0, poolMax: 20, dbSizeBytes: 52_428_800, activeConnections: 2 },
  httpSummary: { total: 500, status426: 1, status429: 10, status5xx: 2, rate426: 0.002, rate429: 0.02, rate5xx: 0.004 },
  ws: {
    onlineCount: 8,
    summary: { upgradesOk: 80, reject401: 1, reject403: 0, reject500: 0, closeNormal: 70, closeAbnormal: 2, closeIdleTimeout: 3 },
    daily: [],
  },
  slowRequests: [],
  alerts: [],
});

const sampleClientMetrics = (days = 7) => ({
  days,
  summary: {
    reports: 85,
    lcp: { p50Ms: 1120, p95Ms: 2450, avgMs: 1380, samples: 80 },
    inp: { p50Ms: 48, p95Ms: 185, avgMs: 64, samples: 70 },
    ttfb: { p50Ms: 130, p95Ms: 420, avgMs: 175, samples: 82 },
    clsAvg: 0.042,
    actionRtt: { p50Ms: 42, p95Ms: 160, avgMs: 58, samples: 600, timeouts: 1, conflicts409: 2 },
    meRtt: { p50Ms: 28, p95Ms: 95, avgMs: 36, samples: 190, timeouts: 0 },
    canvasFrames: 1500,
    canvasLongFrames: 18,
    longFramePct: 1.2,
    wsReconnects: 5,
    wsAbnormalCloses: 1,
  },
  daily: [],
});

vi.mock('../../../../platform/api', () => ({
  api: {
    admin: {
      deployHost: () => null,
      changelog: vi.fn(async () => []),
      httpMetrics: vi.fn(async (days = 30) => sampleHttpMetrics(days)),
      opsHealth: vi.fn(async () => sampleOpsHealth()),
      clientMetrics: vi.fn(async (days = 7) => sampleClientMetrics(days)),
    },
  },
}));

afterEach(cleanup);

const show = (
  access: AdminAccess,
  role: AdminRole = 'admin',
  section: OpsSection = 'server',
  viewMode: 'summary' | 'detail' = 'detail',
) => render(
  <QueryProvider>
    <AdminAuthCtx.Provider value={{ access, uid: null, role, canViewEmail: role === 'admin', showStaffBadge: false, setStaffBadge: async () => {} }}>
      <AdminViewModeCtx.Provider value={{ viewMode, setViewMode: () => {} }}>
        <OpsTab section={section} />
      </AdminViewModeCtx.Provider>
    </AdminAuthCtx.Provider>
  </QueryProvider>,
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

  it('변경 기록 하위 탭에 변경 기록 칸이 있다', () => {
    show('granted', 'admin', 'changelog');
    expect(screen.getByRole('heading', { name: '변경 기록' })).toBeInTheDocument();
  });

  it('콘텐츠 카탈로그 상세 보기에서 이벤트 카탈로그를 보여 준다', () => {
    show('granted', 'admin', 'catalog', 'detail');
    const catalog = screen.getByText('events 스트림 카탈로그').closest('section')!;
    for (const [type, label] of Object.entries(EVENT_LABELS)) {
      const row = within(catalog).getByText(type).closest('tr')!;
      expect(within(row).getByText(label)).toBeInTheDocument();
    }
    for (const type of ['adminRestrict', 'adminUnrestrict', 'adminResetLink', 'adminRevokeSessions']) {
      expect(within(catalog).getByText(type)).toBeInTheDocument();
    }
  });

  it('maintainer 역할의 데이터 계약은 공통 운영 쓰기와 감사 로그 기록을 안내한다', () => {
    show('granted', 'maintainer', 'server', 'detail');
    const contract = screen.getByText('데이터 계약').closest('section')!;
    expect(within(contract).getByText(/우편 발송/)).toBeInTheDocument();
    expect(within(contract).getByText(/무결성 오탐 해제/)).toBeInTheDocument();
    expect(within(contract).getByText(/감사 로그/)).toBeInTheDocument();
  });

  it('요약 보기에서는 서버 4개 상태 카드만 노출하고 정적 안내문과 상세 표를 숨기며, 기간 필터는 1곳만 존재한다', async () => {
    show('granted', 'admin', 'server', 'summary');
    expect(screen.getAllByRole('group', { name: '운영 기간 선택' })).toHaveLength(1);
    expect(screen.getByText('API 상태')).toBeInTheDocument();
    expect(screen.getByText('데이터베이스')).toBeInTheDocument();
    expect(screen.getByText('실시간 채널')).toBeInTheDocument();
    expect(screen.getByText('런타임·오류')).toBeInTheDocument();

    expect(screen.queryByText('이 화면의 정체')).toBeNull();
    expect(screen.queryByText('관측')).toBeNull();
    expect(screen.queryByText('데이터 계약')).toBeNull();
    expect(screen.queryByText('서버, 소켓, DB 상태 및 경보')).toBeNull();
    await waitFor(() => expect(vi.mocked(api.admin.httpMetrics)).toHaveBeenCalledWith(7));
    expect(vi.mocked(api.admin.opsHealth)).toHaveBeenCalledWith(7);
  });

  it('상세 보기에서 HTTP 오류율·429 섹션과 기간 전환(7일/14일/30일)을 단일 제어로 제공한다', async () => {
    show('granted', 'admin', 'server', 'detail');
    expect(screen.getAllByRole('group', { name: '운영 기간 선택' })).toHaveLength(1);
    expect(await screen.findByText('게임 액션')).toBeInTheDocument();
    expect(screen.getByText(/ingress-nginx/)).toBeInTheDocument();
    expect(vi.mocked(api.admin.httpMetrics)).toHaveBeenCalledWith(7);
    expect(screen.getByRole('img', { name: '최근 7일 일별 429 응답 수' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '최근 7일 일별 5xx 오류 수' })).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('group', { name: '운영 기간 선택' })).getByRole('button', { name: '30일' }));
    await waitFor(() => expect(vi.mocked(api.admin.httpMetrics)).toHaveBeenCalledWith(30));
    await waitFor(() => expect(vi.mocked(api.admin.opsHealth)).toHaveBeenCalledWith(30));
    expect(screen.getByRole('img', { name: '최근 30일 일별 429 응답 수' })).toBeInTheDocument();
  });

  it('HTTP 지연 백분위, 세부 상태/429 사유와 서버, 소켓, DB 상태 및 경보 섹션을 함께 렌더링한다', async () => {
    show('granted', 'admin', 'server', 'detail');
    expect(await screen.findByText('140ms')).toBeInTheDocument();
    expect(screen.getByText('22ms')).toBeInTheDocument();
    expect(screen.getByText('310ms')).toBeInTheDocument();
    expect(screen.getByText('45ms')).toBeInTheDocument();
    expect(screen.getByText('캐치 6')).toBeInTheDocument();
    expect(screen.getByText('편지 3')).toBeInTheDocument();
    expect(screen.getByText('기타 1')).toBeInTheDocument();
    expect(screen.getByText('서버, 소켓, DB 상태 및 경보')).toBeInTheDocument();
    expect(await screen.findByText('활성 경보 없음')).toBeInTheDocument();
    expect(vi.mocked(api.admin.opsHealth)).toHaveBeenCalledWith(7);

    cleanup();
    show('granted', 'admin', 'client', 'summary');
    expect(screen.getByText('클라이언트 오류·체감 요약 (최근 7일)')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: '일별 클라이언트 체감 성능' })).toBeNull();

    cleanup();
    show('granted', 'admin', 'client', 'detail');
    expect(screen.getByText('클라이언트 체감 성능 및 단절')).toBeInTheDocument();
    expect(await screen.findByText('2450ms')).toBeInTheDocument();
    expect(screen.getByText('1.2%')).toBeInTheDocument();
    expect(vi.mocked(api.admin.clientMetrics)).toHaveBeenCalledWith(7);
  });

  it('미연결(local) 상태에서 HTTP·서버 상태·클라이언트 성능 섹션의 빈 값 표기를 --로 일관화한다', () => {
    show('local', 'admin', 'server', 'detail');
    for (const heading of [
      '앱 서버 HTTP 오류율·429 (최근 7일)',
      '서버, 소켓, DB 상태 및 경보',
    ]) {
      const section = screen.getByText(heading).closest('section')!;
      expect(within(section).getAllByText('--').length).toBeGreaterThan(0);
      expect(section.textContent).not.toContain('—');
    }
    cleanup();
    show('local', 'admin', 'client', 'detail');
    const clientSection = screen.getByText('클라이언트 체감 성능 및 단절').closest('section')!;
    expect(within(clientSection).getAllByText('--').length).toBeGreaterThan(0);
    expect(clientSection.textContent).not.toContain('—');
  });
});
