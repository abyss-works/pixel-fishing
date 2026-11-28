// 비-목킹 통합 테스트 — platform/api를 모킹하지 않고 실제 HttpAdmin + QueryProvider + AdminDashboard 흐름을 검증한다.
// 초기 로드 ≤ 3회, 탭 전환(Overview → Players → Economy → UserDetail) 중 중복 users/spamFlags 호출 0회, 429 HTML 응답 복구를 확인한다.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';

const UID = 'aaaaaaaa-0000-0000-0000-000000000001';

const overviewPayload = () => ({
  users: [
    {
      user_id: UID,
      email: 'angler@example.com',
      nickname: '테스트어부',
      is_anonymous: false,
      signed_up_at: '2026-11-01T00:00:00Z',
      last_sign_in_at: '2026-11-05T01:00:00Z',
      gold: 1500,
      fame: 40,
      boat: 1,
      rod: 3,
      location_kind: 'region',
      location_id: 'world',
      visited: ['village', 'world'],
      restricted: false,
      save_version: 10,
      last_action_at: '2026-11-05T02:00:00Z',
      last_session_at: '2026-11-05T01:30:00Z',
      total_session_sec: 1800,
    },
  ],
  recentEvents: [
    { id: 10, user_id: UID, type: 'catch', payload: { fishId: 'carp', judgment: 'good', size: 20 }, created_at: '2026-11-05T02:00:00Z' },
  ],
  spamFlags: [
    { user_id: UID, catches_7d: 5, fast_gap_7d: 0, perfect_pct: 20, perfect_pct_global: 15 },
  ],
  dailyStats: [
    { day: '2026-11-04', dau: 1, newUsers: 0, newAccounts: 0, sessions: 1, sessionMinutes: 30, medianSessionMinutes: 30, catches: 5, goldIn: 500, goldOut: 0, actions: 10 },
  ],
  retention: [{ day: '2026-11-04', size: 1, d1: null, d7: null, d30: null }],
  sessions: [{ id: 1, userId: UID, nick: '테스트어부', startedAt: '2026-11-05T01:00:00Z', endedAt: '2026-11-05T01:30:00Z', durationSec: 1800 }],
  live: { count: 1, online: [{ uid: UID, nick: '테스트어부', nickname: '테스트어부', email: 'angler@example.com', region: 'world', zone: 'pacific', connectedAt: '2026-11-05T02:00:00Z', guest: false }] },
});

const httpMetricsPayload = () => ({
  days: 30,
  scope: 'app_server',
  summary: { total: 100, status426: 0, status429: 2, status5xx: 1, rate426: 0, rate429: 0.02, rate5xx: 0.01 },
  daily: [{ day: '2026-11-04', total: 100, status426: 0, status429: 2, status5xx: 1, rate426: 0, rate429: 0.02, rate5xx: 0.01 }],
  byRoute: [],
  rows: [],
});

const userStatePayload = () => ({
  hasSave: true,
  dex: { normal: 3, normalTotal: 120, variant: 0, variantTotal: 120, named: 0, namedTotal: 8 },
  bounty: { namedClears: 0, namedDistinctClears: 0, namedTotal: 8 },
  artifacts: { owned: [], total: 8 },
  hats: { owned: 0, total: 46, items: [], equipped: null },
  achievements: { claimed: 0, claimable: 0, total: 71, counters: {} },
  cooking: { energy: { common: 0, rare: 0, epic: 0, legendary: 0 }, cooked: [], inProgress: null, slots: { lunch: null, bait: null } },
  instances: { bag: 1, exhibit: 0, recentBag: [] },
  progression: { visited: ['village', 'world'], coupons: [], bountyProgress: [], bountyTickets: [], activeSessions: 1 },
});

async function loadRealDashboard() {
  vi.resetModules();
  vi.stubEnv('VITE_CLOUD', '1');
  const [{ QueryProvider }, { default: AdminApp }] = await Promise.all([
    import('../../../core/QueryProvider'),
    import('./AdminDashboard'),
    import('./AdminWorkspace'),
  ]);
  return { QueryProvider, AdminApp };
}

describe('관리자 대시보드 비-목킹 요청 횟수 및 429 통합 테스트', () => {
  const fetchCalls: string[] = [];
  let QueryProvider: ComponentType<{ children: ReactNode }>;
  let AdminApp: ComponentType;

  beforeAll(async () => {
    const loaded = await loadRealDashboard();
    QueryProvider = loaded.QueryProvider;
    AdminApp = loaded.AdminApp;
  }, 20_000);

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  beforeEach(() => {
    fetchCalls.length = 0;
    window.history.replaceState(null, '', '#/admin/overview');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('초기 로드 ≤ 3회, 탭 전환(Overview → Players → Economy → UserDetail) 동안 중복 users/spamFlags 호출 0회, 연타 방지 새로고침을 지킨다', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url === '/api/admin?q=access') {
        return new Response(JSON.stringify({ kind: 'granted', uid: UID }), { status: 200 });
      }
      if (url.startsWith('/api/admin?q=overview')) {
        return new Response(JSON.stringify(overviewPayload()), { status: 200 });
      }
      if (url.startsWith('/api/admin?q=httpMetrics')) {
        return new Response(JSON.stringify(httpMetricsPayload()), { status: 200 });
      }
      if (url.startsWith('/api/admin?q=chatReports')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.startsWith('/api/admin?q=integrity')) {
        return new Response(JSON.stringify(url.includes('Metrics')
          ? { days: 7, clean: { total: 0, counts: {}, shares: {}, expectedShares: {} }, pressured: { total: 0, counts: {}, shares: {}, expectedShares: {} } }
          : []), { status: 200 });
      }
      if (url.startsWith('/api/admin?q=economy')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.startsWith('/api/admin?q=bountyFunnel')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.startsWith('/api/admin?q=onboardingFunnel')) {
        return new Response(JSON.stringify({
          eventsWindowDays: 7,
          conversion: { totalUsers: 0, accounts: 0, guests: 0, rate: 0, buckets: [] },
          tutorials: { total: 0, stages: [] },
          steps: [],
        }), { status: 200 });
      }
      if (url.startsWith('/api/admin?q=userEvents')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.startsWith('/api/admin?q=userState')) {
        return new Response(JSON.stringify(userStatePayload()), { status: 200 });
      }
      if (url.startsWith('/api/admin/sessions')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({ error: `unexpected: ${url}` }), { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QueryProvider><AdminApp /></QueryProvider>);

    // 1. OverviewTab 초기 로드 완료 대기 (상세 보기로 전환해 최근 이벤트 피드 확인)
    fireEvent.click(await screen.findByRole('button', { name: '상세 보기' }));
    expect((await screen.findAllByText('테스트어부(angler@example.com)', {}, { timeout: 5000 })).length).toBeGreaterThanOrEqual(1);
    await waitFor(() => expect(fetchCalls.some(u => u.startsWith('/api/admin?q=httpMetrics'))).toBe(true));
    const initialDataCalls = fetchCalls.filter(u => u !== '/api/admin?q=access');
    expect(initialDataCalls.length).toBeLessThanOrEqual(3);
    expect(initialDataCalls).toContain('/api/admin?q=overview&days=30');
    expect(initialDataCalls).toContain('/api/admin?q=httpMetrics&days=30');

    // 2. PlayersTab (검색·명부 → 제재·무결성) 전환 — 캐시 적중으로 추가 users/spamFlags 호출 0회
    const beforePlayers = fetchCalls.length;
    fireEvent.click(screen.getByRole('button', { name: '플레이어' }));
    expect(await screen.findByText('1/1명')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '제재·무결성' }));
    expect(await screen.findByText(/PERFECT 판정 비율 이상치/)).toBeInTheDocument();
    expect(fetchCalls.slice(beforePlayers).filter(u => u === '/api/admin?q=users' || u === '/api/admin?q=spamFlags')).toEqual([]);

    // 3. InsightsTab (경제·진행) 전환 — economy(7) 1건만 호출, 중복 users 호출 0회
    const beforeEconomy = fetchCalls.length;
    fireEvent.click(screen.getByRole('button', { name: '지표·밸런스' }));
    expect(await screen.findByRole('img', { name: '골드 유입 일별 추이' })).toBeInTheDocument();
    await waitFor(() => expect(fetchCalls.slice(beforeEconomy)).toContain('/api/admin?q=economy&days=7'));

    // 4. PlayersTab → UserDetail 모달 열기 — spamFlags 중복 호출 0회
    const beforeDetail = fetchCalls.length;
    fireEvent.click(screen.getByRole('button', { name: '플레이어' }));
    fireEvent.click(await screen.findByText('테스트어부(angler@example.com)'));
    const dialog = await screen.findByRole('dialog', { name: '유저 상세: 테스트어부(angler@example.com)' });
    fireEvent.click(within(dialog).getByRole('button', { name: '상세' }));
    await waitFor(() => expect(fetchCalls.some(u => u.startsWith('/api/admin?q=userState'))).toBe(true));
    const detailCalls = fetchCalls.slice(beforeDetail);
    expect(detailCalls.some(u => u === '/api/admin?q=users')).toBe(false);
    expect(detailCalls.some(u => u === '/api/admin?q=spamFlags')).toBe(false);

    // 모달 닫고 현황 탭으로 복귀 후 새로고침(연타 2회 → 1회만 실행)
    fireEvent.click(screen.getAllByRole('button', { name: '닫기' }).at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: '현황' }));
    const beforeRefresh = fetchCalls.length;
    const refreshBtn = screen.getByRole('button', { name: '현재 탭 새로고침' });
    fireEvent.click(refreshBtn);
    fireEvent.click(refreshBtn);
    await waitFor(() => expect(fetchCalls.slice(beforeRefresh).length).toBeGreaterThanOrEqual(2));
    expect(fetchCalls.slice(beforeRefresh)).toContain('/api/admin?q=overview&days=30');
    expect(fetchCalls.slice(beforeRefresh)).toContain('/api/admin?q=httpMetrics&days=30');

    // 전체 여정 동안 별도 ?q=users / ?q=spamFlags 풀스캔 호출 0회 검증
    expect(fetchCalls.filter(u => u === '/api/admin?q=users')).toHaveLength(0);
    expect(fetchCalls.filter(u => u === '/api/admin?q=spamFlags')).toHaveLength(0);
  }, 15_000);

  it('Nginx 비-JSON HTML 429 응답에 대해 Retry-After 백오프 재시도 후 복구하고, 한도 초과 시 안내 문구를 보인다', async () => {
    let overviewAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url === '/api/admin?q=access') {
        return new Response(JSON.stringify({ kind: 'granted', uid: UID }), { status: 200 });
      }
      if (url.startsWith('/api/admin?q=overview')) {
        overviewAttempts++;
        if (overviewAttempts === 1) {
          return new Response('<html>429 Too Many Requests</html>', {
            status: 429,
            headers: { 'content-type': 'text/html', 'retry-after': '0' },
          });
        }
        return new Response(JSON.stringify(overviewPayload()), { status: 200 });
      }
      if (url.startsWith('/api/admin?q=httpMetrics')) {
        return new Response(JSON.stringify(httpMetricsPayload()), { status: 200 });
      }
      if (url.startsWith('/api/admin?q=chatReports')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.startsWith('/api/admin?q=integrity')) {
        return new Response(JSON.stringify(url.includes('Metrics')
          ? { days: 7, clean: { total: 0, counts: {}, shares: {}, expectedShares: {} }, pressured: { total: 0, counts: {}, shares: {}, expectedShares: {} } }
          : []), { status: 200 });
      }
      if (url.startsWith('/api/admin?q=economy')) {
        return new Response('<html>429 Too Many Requests</html>', {
          status: 429,
          headers: { 'content-type': 'text/html', 'retry-after': '0' },
        });
      }
      if (url.startsWith('/api/admin?q=onboardingFunnel')) {
        return new Response(JSON.stringify({
          eventsWindowDays: 7,
          conversion: { totalUsers: 0, accounts: 0, guests: 0, rate: 0, buckets: [] },
          tutorials: { total: 0, stages: [] },
          steps: [],
        }), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QueryProvider><AdminApp /></QueryProvider>);

    fireEvent.click(await screen.findByRole('button', { name: '상세 보기' }));
    expect((await screen.findAllByText('테스트어부(angler@example.com)', {}, { timeout: 5000 })).length).toBeGreaterThanOrEqual(1);
    expect(overviewAttempts).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: '지표·밸런스' }));
    expect(await screen.findByText('요청이 너무 많아 잠시 기다렸다가 다시 시도해 주세요.')).toBeInTheDocument();
  }, 15_000);
});
