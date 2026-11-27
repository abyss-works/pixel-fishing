// 관리자 핸들러 단위 테스트 — DB/컨테이너 없이 사문화 ?q= 제거, userState 검증, 우편 안전장치(409 duplicate-mail·멱등·상한)를 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_UID = '00000000-0000-4000-8000-000000000901';
const TARGET_UID = '00000000-0000-4000-8000-000000000902';

const mocks = vi.hoisted(() => ({
  adminSessionUid: vi.fn(async () => ADMIN_UID),
  adminMember: vi.fn(async (): Promise<{ role: 'admin' | 'maintainer'; showStaffBadge: boolean } | null> => ({ role: 'admin', showStaffBadge: false })),
  setAdminStaffBadge: vi.fn(async () => true),
  insertAdminAuditLog: vi.fn(async () => {}),
  userState: vi.fn(async () => ({ hasSave: true })),
  overview: vi.fn(async (): Promise<unknown> => ({
    users: [],
    recentEvents: [],
    spamFlags: [],
    dailyStats: [],
    retention: [],
    sessions: [],
    live: { count: 0, online: [] },
  })),
  economy: vi.fn(async () => []),
  onboardingFunnel: vi.fn(async (): Promise<unknown> => ({
    eventsWindowDays: 7,
    conversion: { totalUsers: 0, guestUsers: 0, googleLinkedUsers: 0, conversionRate: 0, medianMinutes: null, p90Minutes: null, buckets: [] },
    tutorials: { totalUsers: 0, totalWithSave: 0, stages: [] },
    steps: [],
  })),
  readHttpMetrics: vi.fn(async (): Promise<unknown> => ({
    days: 30,
    scope: 'app_server',
    summary: {
      total: 0, status409: 0, status426: 0, status429: 0, status4xx: 0, status5xx: 0,
      rate409: 0, rate426: 0, rate429: 0, rate4xx: 0, rate5xx: 0,
      latency: { p50Ms: null, p95Ms: null, p99Ms: null, avgMs: null, samples: 0 },
      rateLimitReasons: { catchTooSoon: 0, letterGap: 0, other: 0 },
    },
    daily: [],
    byRoute: [],
    rows: [],
  })),
  readClientMetrics: vi.fn(async (): Promise<unknown> => ({
    days: 7,
    summary: {
      reports: 0,
      lcp: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0 },
      inp: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0 },
      ttfb: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0 },
      clsAvg: null,
      actionRtt: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0, timeouts: 0, conflicts409: 0 },
      meRtt: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0, timeouts: 0 },
      canvasFrames: 0,
      canvasLongFrames: 0,
      longFramePct: null,
      wsReconnects: 0,
      wsAbnormalCloses: 0,
    },
    daily: [],
  })),
  readOpsHealth: vi.fn(async (): Promise<unknown> => ({
    runtime: { uptimeSec: 10, rssMb: 50, heapUsedMb: 20, heapTotalMb: 30 },
    database: { poolTotal: 2, poolIdle: 2, poolWaiting: 0, poolMax: 10, dbSizeBytes: 1024, activeConnections: 1 },
    httpSummary: {
      total: 0, status409: 0, status426: 0, status429: 0, status4xx: 0, status5xx: 0,
      rate409: 0, rate426: 0, rate429: 0, rate4xx: 0, rate5xx: 0,
      latency: { p50Ms: null, p95Ms: null, p99Ms: null, avgMs: null, samples: 0 },
      rateLimitReasons: { catchTooSoon: 0, letterGap: 0, other: 0 },
    },
    ws: {
      onlineCount: 0,
      summary: { upgradesOk: 0, reject401: 0, reject403: 0, reject500: 0, closeNormal: 0, closeAbnormal: 0, closeIdleTimeout: 0 },
      daily: [],
    },
    slowRequests: [],
    alerts: [],
  })),
  accountKind: vi.fn(async () => 'member' as const),
  revokeUserSessions: vi.fn(async () => 2),
  recordAdminAction: vi.fn(async () => {}),
  planMail: vi.fn(),
  deliverMail: vi.fn(),
  listAllAdminNotices: vi.fn(async (): Promise<unknown[]> => []),
  listLiveNotices: vi.fn(async (): Promise<unknown[]> => []),
  createNotice: vi.fn(),
  updateNotice: vi.fn(),
  endNoticeNow: vi.fn(),
  deleteNotice: vi.fn(),
  listAdminEvents: vi.fn(async (): Promise<unknown[]> => []),
  createAdminEvent: vi.fn(),
  updateAdminEvent: vi.fn(),
  endAdminEventNow: vi.fn(),
  deleteAdminEvent: vi.fn(),
  listEventDraws: vi.fn(async (): Promise<unknown[]> => []),
  drawEventWinners: vi.fn(),
  listAdminCoupons: vi.fn(async (): Promise<unknown[]> => []),
  createAdminCoupon: vi.fn(),
  updateAdminCoupon: vi.fn(),
  deleteAdminCoupon: vi.fn(),
  notifyAll: vi.fn(),
  notifyUser: vi.fn(),
  onlineUsers: vi.fn((): { uid: string; guest: boolean }[] => []),
  db: { execute: vi.fn() },
  pool: { totalCount: 2, idleCount: 2, waitingCount: 0, options: { max: 10 } },
  withTransaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(mocks.db)),
}));

vi.mock('./_auth/session.js', () => ({
  adminSessionUid: mocks.adminSessionUid,
}));
vi.mock('./_db/client.js', () => ({
  database: () => ({ db: mocks.db, pool: mocks.pool, withTransaction: mocks.withTransaction }),
}));
vi.mock('./_data/admin.js', async () => {
  const actual = await vi.importActual<typeof import('./_data/admin.js')>('./_data/admin.js');
  return {
    ...actual,
    adminMember: mocks.adminMember,
    setAdminStaffBadge: mocks.setAdminStaffBadge,
    insertAdminAuditLog: mocks.insertAdminAuditLog,
    userState: mocks.userState,
    overview: mocks.overview,
    economy: mocks.economy,
  };
});
vi.mock('./_data/adminFunnel.js', () => ({
  onboardingFunnel: mocks.onboardingFunnel,
}));
vi.mock('./_data/httpMetrics.js', () => ({
  readHttpMetrics: mocks.readHttpMetrics,
}));
vi.mock('./_data/clientMetrics.js', () => ({
  readClientMetrics: mocks.readClientMetrics,
}));
vi.mock('./_data/opsHealth.js', () => ({
  readOpsHealth: mocks.readOpsHealth,
}));
vi.mock('./_data/account.js', async () => {
  const actual = await vi.importActual<typeof import('./_data/account.js')>('./_data/account.js');
  return {
    ...actual,
    accountKind: mocks.accountKind,
    revokeUserSessions: mocks.revokeUserSessions,
  };
});
vi.mock('./_data/telemetry.js', async () => {
  const actual = await vi.importActual<typeof import('./_data/telemetry.js')>('./_data/telemetry.js');
  return {
    ...actual,
    recordAdminAction: mocks.recordAdminAction,
  };
});
vi.mock('./_data/notices.js', () => ({
  listAllAdminNotices: mocks.listAllAdminNotices,
  listLiveNotices: mocks.listLiveNotices,
  createNotice: mocks.createNotice,
  updateNotice: mocks.updateNotice,
  endNoticeNow: mocks.endNoticeNow,
  deleteNotice: mocks.deleteNotice,
}));
vi.mock('./_data/events.js', async () => {
  const actual = await vi.importActual<typeof import('./_data/events.js')>('./_data/events.js');
  return {
    ...actual,
    listAdminEvents: mocks.listAdminEvents,
    createAdminEvent: mocks.createAdminEvent,
    updateAdminEvent: mocks.updateAdminEvent,
    endAdminEventNow: mocks.endAdminEventNow,
    deleteAdminEvent: mocks.deleteAdminEvent,
    listEventDraws: mocks.listEventDraws,
    drawEventWinners: mocks.drawEventWinners,
  };
});
vi.mock('./_data/codes.js', async () => {
  const actual = await vi.importActual<typeof import('./_data/codes.js')>('./_data/codes.js');
  return {
    ...actual,
    listAdminCoupons: mocks.listAdminCoupons,
    createAdminCoupon: mocks.createAdminCoupon,
    updateAdminCoupon: mocks.updateAdminCoupon,
    deleteAdminCoupon: mocks.deleteAdminCoupon,
  };
});
vi.mock('./_server/livePresence.js', async () => {
  const actual = await vi.importActual<typeof import('./_server/livePresence.js')>('./_server/livePresence.js');
  return {
    ...actual,
    notifyAll: mocks.notifyAll,
    notifyUser: mocks.notifyUser,
    onlineUsers: mocks.onlineUsers,
  };
});

import handler from './admin.js';
import { computeUserAggregates, opHandle } from './_data/admin.js';
import { clearMailIdempotencyCache, MAX_MAIL_BATCH_TOTAL_GOLD } from './_data/mailbox.js';

async function call(method: string, query: Record<string, string>, body?: unknown) {
  const out = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
  };
  await handler({ method, query, body, headers: {} } as never, res as never);
  return out;
}

describe('api/admin 핸들러 단위 테스트', () => {
  const prevDbUrl = process.env.DATABASE_URL;
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://unit-test';
    vi.clearAllMocks();
    mocks.adminSessionUid.mockResolvedValue(ADMIN_UID);
    mocks.adminMember.mockResolvedValue({ role: 'admin', showStaffBadge: false });
    mocks.setAdminStaffBadge.mockResolvedValue(true);
  });
  afterEach(() => {
    if (prevDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDbUrl;
  });

  it('제거된 사문화 ?q=dailyActive·catchQuality·retention은 400 bad-query를 돌려준다', async () => {
    for (const q of ['dailyActive', 'catchQuality', 'retention']) {
      expect(await call('GET', { q, days: '7' })).toMatchObject({
        status: 400,
        body: { error: 'bad-query' },
      });
    }
  });

  it('GET ?q=userState는 uid UUID를 검증하고 userState 읽기를 호출한다', async () => {
    expect(await call('GET', { q: 'userState' })).toMatchObject({ status: 400, body: { error: 'bad-user' } });
    expect(await call('GET', { q: 'userState', uid: 'not-a-uuid' })).toMatchObject({ status: 400, body: { error: 'bad-user' } });

    const sampleState = { hasSave: true, dex: { normal: 10, normalTotal: 120 } };
    mocks.userState.mockResolvedValueOnce(sampleState);
    const res = await call('GET', { q: 'userState', uid: TARGET_UID });
    expect(res).toMatchObject({ status: 200, body: sampleState });
    expect(mocks.userState).toHaveBeenCalledWith(mocks.db, TARGET_UID);
  });

  it('POST ?q=mail은 중복 수신자·상한 초과·멱등 재전송·최근 중복 발송(409 duplicate-mail)을 차단한다', async () => {
    clearMailIdempotencyCache();

    // 중복 수신자 차단
    const dupRes = await call('POST', { q: 'mail' }, {
      op: 'preview',
      request: {
        title: '안내', body: '본문',
        target: { kind: 'users', recipients: [{ userId: TARGET_UID, gold: 10 }, { userId: TARGET_UID.toUpperCase(), gold: 20 }] },
      },
    });
    expect(dupRes).toMatchObject({ status: 200, body: { problems: ['duplicate'], duplicates: [TARGET_UID], preview: null } });

    // 상한 초과 미리보기
    mocks.db.execute.mockResolvedValueOnce({ rows: [{ id: TARGET_UID }] });
    const capRes = await call('POST', { q: 'mail' }, {
      op: 'preview',
      request: {
        title: '안내', body: '본문',
        target: { kind: 'users', recipients: [{ userId: TARGET_UID, gold: MAX_MAIL_BATCH_TOTAL_GOLD + 1 }] },
      },
    });
    expect(capRes).toMatchObject({
      status: 200,
      body: {
        problems: ['totalGold'],
        preview: { recipientCount: 1, capExceeded: true, maxTotalGold: MAX_MAIL_BATCH_TOTAL_GOLD },
      },
    });

    // 멱등 키 1회 성공 후 재전송 차단
    const key = '11111111-1111-4111-8111-111111111111';
    const mailReq = {
      title: '안내', body: '본문',
      target: { kind: 'users', recipients: [{ userId: TARGET_UID, gold: 100 }] },
    };
    mocks.db.execute
      .mockResolvedValueOnce({ rows: [{ key }] })            // admin_mail_idempotency insert
      .mockResolvedValueOnce({ rows: [{ id: TARGET_UID }] }) // previewMails
      .mockResolvedValueOnce({ rows: [{ found: false }] })   // hasRecentDuplicateMail
      .mockResolvedValueOnce({ rows: [{ n: 1 }] })           // sendMails
      .mockResolvedValueOnce({ rows: [] });                  // admin_mail_idempotency update
    mocks.notifyUser.mockClear();
    const first = await call('POST', { q: 'mail' }, { op: 'send', request: mailReq, idempotencyKey: key });
    expect(first).toMatchObject({ status: 200, body: { sent: 1, problems: [] } });
    expect(mocks.notifyUser).toHaveBeenCalledTimes(1);
    expect(mocks.notifyUser).toHaveBeenCalledWith(TARGET_UID, { t: 'mail' });

    const replayFingerprint = JSON.stringify({
      title: '안내',
      body: '본문',
      target: {
        kind: 'users',
        recipients: [{ userId: TARGET_UID, gold: 100, items: [], hats: [] }],
      },
    });
    mocks.db.execute
      .mockResolvedValueOnce({ rows: [] })                   // admin_mail_idempotency insert conflict
      .mockResolvedValueOnce({                               // admin_mail_idempotency select for update
        rows: [{
          fingerprint: replayFingerprint,
          result: {
            problems: [],
            preview: {
              count: 1,
              recipientCount: 1,
              totalGold: 100,
              capExceeded: false,
              maxTotalGold: MAX_MAIL_BATCH_TOTAL_GOLD,
              missing: [],
            },
            sent: 1,
          },
          expires_at: new Date(Date.now() + 60_000),
        }],
      });
    const replay = await call('POST', { q: 'mail' }, { op: 'send', request: mailReq, idempotencyKey: key });
    expect(replay).toMatchObject({ status: 200, body: { sent: 0, idempotent: true } });
    expect(mocks.notifyUser).toHaveBeenCalledTimes(1);

    // 다른 키로 10분 내 동일 우편 재시도 시 DB 중복 창이 409 duplicate-mail로 차단
    mocks.db.execute
      .mockResolvedValueOnce({ rows: [{ key: '22222222-2222-4222-8222-222222222222' }] }) // admin_mail_idempotency insert
      .mockResolvedValueOnce({ rows: [{ id: TARGET_UID }] })
      .mockResolvedValueOnce({ rows: [{ found: true }] });
    const dupWindow = await call('POST', { q: 'mail' }, {
      op: 'send',
      request: { ...mailReq, idempotencyKey: '22222222-2222-4222-8222-222222222222' },
    });
    expect(dupWindow).toMatchObject({ status: 409, body: { error: 'duplicate-mail' } });
    expect(mocks.notifyUser).toHaveBeenCalledTimes(1);

    // 전체 대상 발송 시 게스트를 제외한 접속 유저에게만 { t: 'mail' } 알림을 푸시한다
    mocks.notifyUser.mockClear();
    mocks.onlineUsers.mockReturnValueOnce([
      { uid: TARGET_UID, guest: false },
      { uid: '00000000-0000-4000-8000-000000000999', guest: true },
    ]);
    mocks.db.execute
      .mockResolvedValueOnce({ rows: [{ id: TARGET_UID }] }) // allPlayerIds
      .mockResolvedValueOnce({ rows: [{ id: TARGET_UID }] }) // previewMails
      .mockResolvedValueOnce({ rows: [{ found: false }] })   // hasRecentDuplicateMail
      .mockResolvedValueOnce({ rows: [{ n: 1 }] });          // sendMails
    const allRes = await call('POST', { q: 'mail' }, {
      op: 'send',
      request: { title: '전체공지우편', body: '전체본문', target: { kind: 'all', gold: 50 } },
    });
    expect(allRes).toMatchObject({ status: 200, body: { sent: 1, problems: [] } });
    expect(mocks.notifyUser).toHaveBeenCalledTimes(1);
    expect(mocks.notifyUser).toHaveBeenCalledWith(TARGET_UID, { t: 'mail' });
  });

  it('GET ?q=overview는 기본 30일 또는 지정 기간으로 통합 요약 데이터를 돌려주고 잘못된 기간은 400이다', async () => {
    expect(await call('GET', { q: 'overview', days: '0' })).toMatchObject({ status: 400, body: { error: 'bad-days' } });
    expect(await call('GET', { q: 'overview', days: '181' })).toMatchObject({ status: 400, body: { error: 'bad-days' } });
    expect(await call('GET', { q: 'overview', days: 'abc' })).toMatchObject({ status: 400, body: { error: 'bad-days' } });

    const payload = {
      users: [{ user_id: TARGET_UID }],
      recentEvents: [],
      spamFlags: [],
      dailyStats: [],
      retention: [],
      sessions: [],
      live: { count: 1, online: [{ uid: TARGET_UID, nick: '테스터', nickname: '테스터', email: null, region: 'world', zone: 'pacific', connectedAt: '2026-11-05T00:00:00Z', guest: false }] },
    };
    mocks.overview.mockResolvedValueOnce(payload);

    const defRes = await call('GET', { q: 'overview' });
    expect(defRes).toMatchObject({ status: 200, body: payload });
    expect(mocks.overview).toHaveBeenCalledWith(mocks.db, 30, expect.any(Array), 'admin');

    await call('GET', { q: 'overview', days: '7' });
    expect(mocks.overview).toHaveBeenLastCalledWith(mocks.db, 7, expect.any(Array), 'admin');
  });

  it('POST ?q=revokeSessions는 대상 계정의 세션을 삭제하고 감사 이벤트를 남기며 없는 계정은 404다', async () => {
    expect(await call('POST', { q: 'revokeSessions' }, {})).toMatchObject({ status: 400, body: { error: 'bad-user' } });
    expect(await call('POST', { q: 'revokeSessions' }, { userId: 'nope' })).toMatchObject({ status: 400, body: { error: 'bad-user' } });

    mocks.accountKind.mockResolvedValueOnce('missing' as never);
    expect(await call('POST', { q: 'revokeSessions' }, { userId: TARGET_UID })).toMatchObject({ status: 404, body: { error: 'no-user' } });
    expect(mocks.revokeUserSessions).not.toHaveBeenCalled();

    mocks.accountKind.mockResolvedValueOnce('member');
    mocks.revokeUserSessions.mockResolvedValueOnce(3);
    const okRes = await call('POST', { q: 'revokeSessions' }, { userId: TARGET_UID });
    expect(okRes).toMatchObject({ status: 200, body: { revoked: 3 } });
    expect(mocks.revokeUserSessions).toHaveBeenCalledWith(mocks.db, TARGET_UID);
    expect(mocks.recordAdminAction).toHaveBeenCalledWith(mocks.db, TARGET_UID, 'adminRevokeSessions', ADMIN_UID, { revoked: 3 });
  });

  it('GET ?q=onboardingFunnel은 온보딩 퍼널 조회를 호출한다', async () => {
    const sample = {
      eventsWindowDays: 7,
      conversion: { totalUsers: 5, guestUsers: 3, googleLinkedUsers: 2, conversionRate: 0.4, medianMinutes: 15, p90Minutes: 60, buckets: [] },
      tutorials: { totalUsers: 5, totalWithSave: 4, stages: [] },
      steps: [],
    };
    mocks.onboardingFunnel.mockResolvedValueOnce(sample);
    const res = await call('GET', { q: 'onboardingFunnel' });
    expect(res).toMatchObject({ status: 200, body: sample });
    expect(mocks.onboardingFunnel).toHaveBeenCalledWith(mocks.db);
  });

  it('GET ?q=httpMetrics는 기본 30일 또는 1~90일 범위로 조회하고 잘못된 기간은 400이다', async () => {
    for (const bad of ['0', '91', 'abc']) {
      expect(await call('GET', { q: 'httpMetrics', days: bad })).toMatchObject({ status: 400, body: { error: 'bad-days' } });
    }
    const sample = {
      days: 7,
      scope: 'app_server',
      summary: { total: 100, status426: 1, status429: 2, status5xx: 3, rate426: 0.01, rate429: 0.02, rate5xx: 0.03 },
      daily: [],
      byRoute: [],
      rows: [],
    };
    mocks.readHttpMetrics.mockResolvedValueOnce(sample);
    expect(await call('GET', { q: 'httpMetrics' })).toMatchObject({ status: 200, body: sample });
    expect(mocks.readHttpMetrics).toHaveBeenCalledWith(mocks.db, 30);

    mocks.readHttpMetrics.mockResolvedValueOnce(sample);
    expect(await call('GET', { q: 'httpMetrics', days: '7' })).toMatchObject({ status: 200, body: sample });
    expect(mocks.readHttpMetrics).toHaveBeenLastCalledWith(mocks.db, 7);
  });

  it('GET ?q=opsHealth는 admin·maintainer 모두 허용하고 기간 검증·Zero-PII·pool 전달을 수행한다', async () => {
    for (const bad of ['0', '91', 'abc']) {
      expect(await call('GET', { q: 'opsHealth', days: bad })).toMatchObject({ status: 400, body: { error: 'bad-days' } });
    }

    const adminRes = await call('GET', { q: 'opsHealth' });
    expect(adminRes.status).toBe(200);
    expect(mocks.readOpsHealth).toHaveBeenCalledWith(mocks.db, mocks.pool, expect.objectContaining({ days: 7, onlineCount: 0 }));

    mocks.adminMember.mockResolvedValueOnce({ role: 'maintainer', showStaffBadge: false });
    const maintRes = await call('GET', { q: 'opsHealth', days: '14' });
    expect(maintRes.status).toBe(200);
    expect(mocks.readOpsHealth).toHaveBeenLastCalledWith(mocks.db, mocks.pool, expect.objectContaining({ days: 14 }));
    expect(JSON.stringify(maintRes.body)).not.toMatch(/email|nickname|userId|user_id/i);
  });

  it('GET ?q=clientMetrics는 admin·maintainer 모두 허용하고 기본 7일(1~90일) 검증 및 Zero-PII를 유지한다', async () => {
    for (const bad of ['0', '91', 'abc']) {
      expect(await call('GET', { q: 'clientMetrics', days: bad })).toMatchObject({ status: 400, body: { error: 'bad-days' } });
    }

    const adminRes = await call('GET', { q: 'clientMetrics' });
    expect(adminRes.status).toBe(200);
    expect(mocks.readClientMetrics).toHaveBeenCalledWith(mocks.db, 7);

    mocks.adminMember.mockResolvedValueOnce({ role: 'maintainer', showStaffBadge: false });
    const maintRes = await call('GET', { q: 'clientMetrics', days: '30' });
    expect(maintRes.status).toBe(200);
    expect(mocks.readClientMetrics).toHaveBeenLastCalledWith(mocks.db, 30);
    expect(JSON.stringify(maintRes.body)).not.toMatch(/email|nickname|userId|user_id/i);
  });

  it('GET ?q=notices는 공지 전체 목록 조회를 호출한다', async () => {
    const sample = [{
      id: 1, title: '점검', body: '본문',
      startsAt: '2030-01-01T00:00:00.000Z', endsAt: '2030-01-02T00:00:00.000Z',
      createdBy: ADMIN_UID, createdAt: '2029-12-31T00:00:00.000Z', updatedAt: '2029-12-31T00:00:00.000Z',
    }];
    mocks.listAllAdminNotices.mockResolvedValueOnce(sample);
    const res = await call('GET', { q: 'notices' });
    expect(res).toMatchObject({ status: 200, body: sample });
    expect(mocks.listAllAdminNotices).toHaveBeenCalledWith(mocks.db);
  });

  it('POST ?q=notices는 op별 검증·저장·실시간 전체 전파(notifyAll)를 수행한다', async () => {
    // 잘못된 op / id / draft 검증
    expect(await call('POST', { q: 'notices' }, { op: 'unknown' })).toMatchObject({ status: 400, body: { error: 'bad-notice' } });
    expect(await call('POST', { q: 'notices' }, {
      op: 'create', title: '  ', body: '본문',
      startsAt: '2030-01-01T00:00:00.000Z', endsAt: '2030-01-02T00:00:00.000Z',
    })).toMatchObject({ status: 400, body: { error: 'bad-title' } });
    expect(await call('POST', { q: 'notices' }, {
      op: 'create', title: '제목', body: '',
      startsAt: '2030-01-01T00:00:00.000Z', endsAt: '2030-01-02T00:00:00.000Z',
    })).toMatchObject({ status: 400, body: { error: 'bad-body' } });
    expect(await call('POST', { q: 'notices' }, {
      op: 'create', title: '제목', body: '본문',
      startsAt: '2030-01-02T00:00:00.000Z', endsAt: '2030-01-01T00:00:00.000Z',
    })).toMatchObject({ status: 400, body: { error: 'bad-window' } });
    expect(await call('POST', { q: 'notices' }, { op: 'end', id: 0 })).toMatchObject({ status: 400, body: { error: 'bad-notice' } });
    expect(await call('POST', { q: 'notices' }, { op: 'delete', id: '1' })).toMatchObject({ status: 400, body: { error: 'bad-notice' } });
    expect(mocks.notifyAll).not.toHaveBeenCalled();

    const created = {
      id: 10, title: '공지', body: '내용',
      startsAt: '2030-01-01T00:00:00.000Z', endsAt: '2030-01-02T00:00:00.000Z',
      createdBy: ADMIN_UID, createdAt: '2029-12-31T00:00:00.000Z', updatedAt: '2029-12-31T00:00:00.000Z',
    };
    const activeList = [{
      id: 10, title: '공지', body: '내용',
      startsAt: '2030-01-01T00:00:00.000Z', endsAt: '2030-01-02T00:00:00.000Z',
      createdAt: '2029-12-31T00:00:00.000Z',
    }];
    mocks.createNotice.mockResolvedValueOnce(created);
    mocks.listLiveNotices.mockResolvedValueOnce(activeList);

    const createRes = await call('POST', { q: 'notices' }, {
      op: 'create', title: '  공지 ', body: ' 내용 ',
      startsAt: '2030-01-01T00:00:00Z', endsAt: '2030-01-02T00:00:00Z',
    });
    expect(createRes).toMatchObject({ status: 200, body: { notice: created } });
    expect(mocks.createNotice).toHaveBeenCalledWith(mocks.db, {
      title: '공지',
      body: '내용',
      startsAt: '2030-01-01T00:00:00.000Z',
      endsAt: '2030-01-02T00:00:00.000Z',
      createdBy: ADMIN_UID,
    });
    expect(mocks.notifyAll).toHaveBeenLastCalledWith({ t: 'notices', notices: activeList });

    // update 미존재 404 및 성공
    mocks.updateNotice.mockResolvedValueOnce(null);
    expect(await call('POST', { q: 'notices' }, {
      op: 'update', id: 99, title: '수정', body: '내용',
      startsAt: '2030-01-01T00:00:00.000Z', endsAt: '2030-01-03T00:00:00.000Z',
    })).toMatchObject({ status: 404, body: { error: 'no-notice' } });

    const updated = { ...created, title: '수정' };
    mocks.updateNotice.mockResolvedValueOnce(updated);
    mocks.listLiveNotices.mockResolvedValueOnce([{ ...activeList[0], title: '수정' }]);
    expect(await call('POST', { q: 'notices' }, {
      op: 'update', id: 10, title: '수정', body: '내용',
      startsAt: '2030-01-01T00:00:00.000Z', endsAt: '2030-01-02T00:00:00.000Z',
    })).toMatchObject({ status: 200, body: { notice: updated } });
    expect(mocks.notifyAll).toHaveBeenLastCalledWith({ t: 'notices', notices: [{ ...activeList[0], title: '수정' }] });

    // end — 마감된 공지도 최근 마감 목록으로 함께 전파된다
    const endedNotice = { ...activeList[0], endsAt: '2029-12-31T01:00:00.000Z' };
    mocks.endNoticeNow.mockResolvedValueOnce(created);
    mocks.listLiveNotices.mockResolvedValueOnce([endedNotice]);
    expect(await call('POST', { q: 'notices' }, { op: 'end', id: 10 })).toMatchObject({ status: 200, body: { notice: created } });
    expect(mocks.notifyAll).toHaveBeenLastCalledWith({ t: 'notices', notices: [endedNotice] });

    // delete
    mocks.deleteNotice.mockResolvedValueOnce(false);
    expect(await call('POST', { q: 'notices' }, { op: 'delete', id: 10 })).toMatchObject({ status: 404, body: { error: 'no-notice' } });

    mocks.deleteNotice.mockResolvedValueOnce(true);
    mocks.listLiveNotices.mockResolvedValueOnce([]);
    expect(await call('POST', { q: 'notices' }, { op: 'delete', id: 10 })).toMatchObject({ status: 200, body: { deleted: true, id: 10 } });
    expect(mocks.notifyAll).toHaveBeenLastCalledWith({ t: 'notices', notices: [] });
    expect(mocks.notifyAll).toHaveBeenCalledTimes(4);
  });

  it('GET/POST ?q=events, ?q=eventDraws, ?q=coupons 검증 및 draw 실시간 우편 알림을 확인한다', async () => {
    expect(await call('GET', { q: 'eventDraws', eventId: 'bad id' })).toMatchObject({ status: 400, body: { error: 'bad-event' } });
    mocks.listEventDraws.mockResolvedValueOnce([{ id: 1, eventId: 'evt-1', userId: TARGET_UID }]);
    expect(await call('GET', { q: 'eventDraws', eventId: 'evt-1' })).toMatchObject({
      status: 200,
      body: [{ id: 1, eventId: 'evt-1', userId: TARGET_UID }],
    });
    expect(mocks.listEventDraws).toHaveBeenCalledWith(mocks.db, 'evt-1');

    expect(await call('POST', { q: 'events' }, { op: 'unknown' })).toMatchObject({ status: 400, body: { error: 'bad-event' } });
    mocks.drawEventWinners.mockResolvedValueOnce({
      eventId: 'evt-1',
      draws: [{ userId: TARGET_UID, rewardPin: 'PIN-1' }],
    });
    expect(await call('POST', { q: 'events' }, { op: 'draw', id: 'evt-1', count: 1 })).toMatchObject({
      status: 200,
      body: { eventId: 'evt-1', draws: [{ userId: TARGET_UID, rewardPin: 'PIN-1' }] },
    });
    expect(mocks.drawEventWinners).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventId: 'evt-1', count: 1, drawnBy: ADMIN_UID }),
      expect.any(String),
    );
    expect(mocks.notifyUser).toHaveBeenCalledWith(TARGET_UID, { t: 'mail' });

    expect(await call('POST', { q: 'coupons' }, { op: 'create', code: '출항준비', gold: 100, description: '차단' })).toMatchObject({
      status: 400,
      body: { error: 'bad-coupon' },
    });
    expect(mocks.insertAdminAuditLog).not.toHaveBeenCalled();

    mocks.createAdminCoupon.mockResolvedValueOnce('duplicate');
    expect(await call('POST', { q: 'coupons' }, {
      op: 'create',
      code: 'DUP-CODE',
      gold: 100,
      description: '중복',
    })).toMatchObject({ status: 409, body: { error: 'duplicate-coupon' } });
    expect(mocks.insertAdminAuditLog).not.toHaveBeenCalled();

    mocks.updateAdminCoupon.mockResolvedValueOnce(null);
    expect(await call('POST', { q: 'coupons' }, {
      op: 'update',
      code: 'MISSING-CODE',
      gold: 100,
      items: [],
      description: '미존재',
      active: true,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      perAccountLimit: 1,
    })).toMatchObject({ status: 404, body: { error: 'no-coupon' } });
    expect(mocks.insertAdminAuditLog).not.toHaveBeenCalled();

    mocks.deleteAdminCoupon.mockResolvedValueOnce(false);
    expect(await call('POST', { q: 'coupons' }, { op: 'delete', code: 'MISSING-CODE' })).toMatchObject({
      status: 404,
      body: { error: 'no-coupon' },
    });
    expect(mocks.insertAdminAuditLog).not.toHaveBeenCalled();

    const createdCoupon = {
      code: 'ADMIN-COUPON',
      gold: 250,
      items: [{ id: 'luck-small', qty: 2 }],
      description: '관리자 쿠폰',
      active: true,
      startsAt: null,
      endsAt: null,
      maxRedemptions: 100,
      perAccountLimit: 1,
      redeemedCount: 0,
      createdAt: '2030-01-01T00:00:00.000Z',
    };
    mocks.createAdminCoupon.mockResolvedValueOnce(createdCoupon);
    expect(await call('POST', { q: 'coupons' }, {
      op: 'create',
      code: 'ADMIN-COUPON',
      gold: 250,
      items: [{ id: 'luck-small', qty: 2 }],
      description: '관리자 쿠폰',
      maxRedemptions: 100,
    })).toMatchObject({ status: 200, body: { coupon: createdCoupon } });
    expect(mocks.insertAdminAuditLog).toHaveBeenLastCalledWith(mocks.db, {
      actorId: ADMIN_UID,
      actorRole: 'admin',
      action: 'couponCreate',
      targetId: null,
      reason: 'ADMIN-COUPON',
      detail: {
        code: 'ADMIN-COUPON',
        gold: 250,
        itemsCount: 1,
        active: true,
        maxRedemptions: 100,
        perAccountLimit: 1,
      },
    });

    const updatedCoupon = { ...createdCoupon, gold: 300, active: false };
    mocks.updateAdminCoupon.mockResolvedValueOnce(updatedCoupon);
    expect(await call('POST', { q: 'coupons' }, {
      op: 'update',
      code: 'ADMIN-COUPON',
      gold: 300,
      items: [{ id: 'luck-small', qty: 2 }],
      description: '수정 설명',
      active: false,
      startsAt: null,
      endsAt: null,
      maxRedemptions: 100,
      perAccountLimit: 1,
    })).toMatchObject({ status: 200, body: { coupon: updatedCoupon } });
    expect(mocks.insertAdminAuditLog).toHaveBeenLastCalledWith(mocks.db, {
      actorId: ADMIN_UID,
      actorRole: 'admin',
      action: 'couponUpdate',
      targetId: null,
      reason: 'ADMIN-COUPON',
      detail: {
        code: 'ADMIN-COUPON',
        gold: 300,
        itemsCount: 1,
        active: false,
        maxRedemptions: 100,
        perAccountLimit: 1,
      },
    });

    mocks.deleteAdminCoupon.mockResolvedValueOnce(true);
    expect(await call('POST', { q: 'coupons' }, { op: 'delete', code: 'ADMIN-COUPON' })).toMatchObject({
      status: 200,
      body: { deleted: true, code: 'ADMIN-COUPON' },
    });
    expect(mocks.insertAdminAuditLog).toHaveBeenLastCalledWith(mocks.db, {
      actorId: ADMIN_UID,
      actorRole: 'admin',
      action: 'couponDelete',
      targetId: null,
      reason: 'ADMIN-COUPON',
      detail: { code: 'ADMIN-COUPON' },
    });
  });

  it('POST ?q=coupons는 단일 withTransaction 안에서 DB 쓰기와 감사 로그를 실행하고 실패 시 전파하며 int4 상한 초과를 400으로 막는다', async () => {
    // maxRedemptions / perAccountLimit int4 상한(2_147_483_647) 초과 차단
    for (const badField of [
      { maxRedemptions: 2_147_483_648 },
      { perAccountLimit: 2_147_483_648 },
    ]) {
      expect(await call('POST', { q: 'coupons' }, {
        op: 'create',
        code: 'OVER-LIMIT',
        gold: 100,
        description: '상한 초과',
        ...badField,
      })).toMatchObject({ status: 400, body: { error: 'bad-coupon' } });
      expect(await call('POST', { q: 'coupons' }, {
        op: 'update',
        code: 'OVER-LIMIT',
        gold: 100,
        items: [],
        description: '상한 초과',
        active: true,
        startsAt: null,
        endsAt: null,
        maxRedemptions: 1,
        perAccountLimit: 1,
        ...badField,
      })).toMatchObject({ status: 400, body: { error: 'bad-coupon' } });
    }
    expect(mocks.createAdminCoupon).not.toHaveBeenCalled();
    expect(mocks.updateAdminCoupon).not.toHaveBeenCalled();
    expect(mocks.insertAdminAuditLog).not.toHaveBeenCalled();

    // create / update / delete 모두 withTransaction의 동일 tx 클라이언트로 DB 쓰기와 감사 로그를 묶는다
    const txClient = { execute: vi.fn(), tag: 'tx-client' };
    const couponAtMax = {
      code: 'TX-COUPON',
      gold: 100,
      items: [],
      description: '트랜잭션 검증',
      active: true,
      startsAt: null,
      endsAt: null,
      maxRedemptions: 2_147_483_647,
      perAccountLimit: 2_147_483_647,
      redeemedCount: 0,
      createdAt: '2030-01-01T00:00:00.000Z',
    };

    mocks.withTransaction.mockImplementationOnce(async run => run(txClient));
    mocks.createAdminCoupon.mockResolvedValueOnce(couponAtMax);
    expect(await call('POST', { q: 'coupons' }, {
      op: 'create',
      code: 'TX-COUPON',
      gold: 100,
      description: '트랜잭션 검증',
      maxRedemptions: 2_147_483_647,
      perAccountLimit: 2_147_483_647,
    })).toMatchObject({ status: 200, body: { coupon: couponAtMax } });
    expect(mocks.createAdminCoupon).toHaveBeenLastCalledWith(txClient, expect.objectContaining({ code: 'TX-COUPON' }));
    expect(mocks.insertAdminAuditLog).toHaveBeenLastCalledWith(txClient, expect.objectContaining({ action: 'couponCreate' }));

    mocks.withTransaction.mockImplementationOnce(async run => run(txClient));
    mocks.updateAdminCoupon.mockResolvedValueOnce(couponAtMax);
    expect(await call('POST', { q: 'coupons' }, {
      op: 'update',
      code: 'TX-COUPON',
      gold: 100,
      items: [],
      description: '트랜잭션 검증',
      active: true,
      startsAt: null,
      endsAt: null,
      maxRedemptions: 2_147_483_647,
      perAccountLimit: 2_147_483_647,
    })).toMatchObject({ status: 200, body: { coupon: couponAtMax } });
    expect(mocks.updateAdminCoupon).toHaveBeenLastCalledWith(txClient, expect.objectContaining({ code: 'TX-COUPON' }));
    expect(mocks.insertAdminAuditLog).toHaveBeenLastCalledWith(txClient, expect.objectContaining({ action: 'couponUpdate' }));

    mocks.withTransaction.mockImplementationOnce(async run => run(txClient));
    mocks.deleteAdminCoupon.mockResolvedValueOnce(true);
    expect(await call('POST', { q: 'coupons' }, { op: 'delete', code: 'TX-COUPON' })).toMatchObject({
      status: 200,
      body: { deleted: true, code: 'TX-COUPON' },
    });
    expect(mocks.deleteAdminCoupon).toHaveBeenLastCalledWith(txClient, 'TX-COUPON');
    expect(mocks.insertAdminAuditLog).toHaveBeenLastCalledWith(txClient, expect.objectContaining({ action: 'couponDelete' }));

    // 감사 로그 기록 실패 시 트랜잭션이 실패를 전파해 500 db-write로 롤백된다
    let rolledBack = false;
    mocks.withTransaction.mockImplementationOnce(async run => {
      try {
        return await run(txClient);
      } catch (e) {
        rolledBack = true;
        throw e;
      }
    });
    mocks.createAdminCoupon.mockResolvedValueOnce(couponAtMax);
    mocks.insertAdminAuditLog.mockRejectedValueOnce(new Error('audit failure'));
    expect(await call('POST', { q: 'coupons' }, {
      op: 'create',
      code: 'TX-ROLLBACK',
      gold: 100,
      description: '롤백 검증',
    })).toMatchObject({ status: 500, body: { error: 'db-write' } });
    expect(rolledBack).toBe(true);
  });

  it('access는 role과 showStaffBadge를 함께 돌려주고 maintainer 권한 밖 읽기·쓰기는 403으로 차단한다', async () => {
    mocks.adminMember.mockResolvedValue({ role: 'maintainer', showStaffBadge: true });

    expect(await call('GET', { q: 'access' })).toMatchObject({
      status: 200,
      body: { kind: 'granted', uid: ADMIN_UID, role: 'maintainer', showStaffBadge: true },
    });

    for (const [q, extra] of [
      ['userState', { uid: TARGET_UID }],
      ['userEvents', { user: TARGET_UID }],
      ['letters', {}],
      ['mails', {}],
      ['events', {}],
      ['eventDraws', { eventId: 'evt-1' }],
    ] as const) {
      expect(await call('GET', { q, ...extra }), `GET ${q}`).toMatchObject({ status: 403, body: { error: 'forbidden' } });
    }

    for (const q of ['mail', 'restrict', 'letterHandled', 'revokeSessions', 'events']) {
      expect(await call('POST', { q }, {})).toMatchObject({ status: 403, body: { error: 'forbidden' } });
    }

    // maintainer는 coupons 조회·생성·수정·삭제를 수행할 수 있고 감사 로그가 남는다
    const maintCoupon = {
      code: 'MAINT-COUPON',
      gold: 100,
      items: [],
      description: '메인테이너 쿠폰',
      active: true,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      perAccountLimit: 1,
      redeemedCount: 0,
      createdAt: '2030-01-01T00:00:00.000Z',
    };
    mocks.listAdminCoupons.mockResolvedValueOnce([maintCoupon]);
    expect(await call('GET', { q: 'coupons' })).toMatchObject({ status: 200, body: [maintCoupon] });

    mocks.createAdminCoupon.mockResolvedValueOnce(maintCoupon);
    expect(await call('POST', { q: 'coupons' }, {
      op: 'create',
      code: 'MAINT-COUPON',
      gold: 100,
      items: [],
      description: '메인테이너 쿠폰',
    })).toMatchObject({ status: 200, body: { coupon: maintCoupon } });
    expect(mocks.insertAdminAuditLog).toHaveBeenLastCalledWith(mocks.db, {
      actorId: ADMIN_UID,
      actorRole: 'maintainer',
      action: 'couponCreate',
      targetId: null,
      reason: 'MAINT-COUPON',
      detail: {
        code: 'MAINT-COUPON',
        gold: 100,
        itemsCount: 0,
        active: true,
        maxRedemptions: null,
        perAccountLimit: 1,
      },
    });

    mocks.updateAdminCoupon.mockResolvedValueOnce({ ...maintCoupon, active: false });
    expect(await call('POST', { q: 'coupons' }, {
      op: 'update',
      code: 'MAINT-COUPON',
      gold: 100,
      items: [],
      description: '메인테이너 쿠폰',
      active: false,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      perAccountLimit: 1,
    })).toMatchObject({ status: 200, body: { coupon: { ...maintCoupon, active: false } } });
    expect(mocks.insertAdminAuditLog).toHaveBeenLastCalledWith(mocks.db, {
      actorId: ADMIN_UID,
      actorRole: 'maintainer',
      action: 'couponUpdate',
      targetId: null,
      reason: 'MAINT-COUPON',
      detail: {
        code: 'MAINT-COUPON',
        gold: 100,
        itemsCount: 0,
        active: false,
        maxRedemptions: null,
        perAccountLimit: 1,
      },
    });

    mocks.deleteAdminCoupon.mockResolvedValueOnce(true);
    expect(await call('POST', { q: 'coupons' }, { op: 'delete', code: 'MAINT-COUPON' })).toMatchObject({
      status: 200,
      body: { deleted: true, code: 'MAINT-COUPON' },
    });
    expect(mocks.insertAdminAuditLog).toHaveBeenLastCalledWith(mocks.db, {
      actorId: ADMIN_UID,
      actorRole: 'maintainer',
      action: 'couponDelete',
      targetId: null,
      reason: 'MAINT-COUPON',
      detail: { code: 'MAINT-COUPON' },
    });

    expect(await call('POST', { q: 'staffBadge' }, { show: 'yes' })).toMatchObject({
      status: 400, body: { error: 'bad-staff-badge' },
    });
    expect(await call('POST', { q: 'staffBadge' }, { show: false })).toMatchObject({
      status: 200, body: { showStaffBadge: false },
    });
    expect(mocks.setAdminStaffBadge).toHaveBeenCalledWith(mocks.db, ADMIN_UID, false);
    expect(mocks.insertAdminAuditLog).toHaveBeenCalledWith(mocks.db, {
      actorId: ADMIN_UID,
      actorRole: 'maintainer',
      action: 'staffBadge',
      targetId: ADMIN_UID,
      detail: { showStaffBadge: false },
    });
  });

  it('maintainer의 GET/POST ?q=notices는 createdBy를 opHandle로 마스킹하고 admin은 원본 UUID를 유지한다', async () => {
    const maintUid = '00000000-0000-4000-8000-000000000909';
    const expectedAdminHandle = opHandle(ADMIN_UID);
    const expectedMaintHandle = opHandle(maintUid);
    const noticeByAdmin = {
      id: 1, title: '공지1', body: '본문1',
      startsAt: '2030-01-01T00:00:00.000Z', endsAt: '2030-01-02T00:00:00.000Z',
      createdBy: ADMIN_UID, createdAt: '2029-12-31T00:00:00.000Z', updatedAt: '2029-12-31T00:00:00.000Z',
    };
    const noticeByNull = { ...noticeByAdmin, id: 2, createdBy: null };

    mocks.adminMember.mockResolvedValue({ role: 'maintainer', showStaffBadge: false });
    mocks.listAllAdminNotices.mockResolvedValueOnce([noticeByAdmin, noticeByNull]);
    const listMaint = await call('GET', { q: 'notices' });
    expect(listMaint.status).toBe(200);
    expect(listMaint.body).toEqual([
      { ...noticeByAdmin, createdBy: expectedAdminHandle },
      noticeByNull,
    ]);
    expect(JSON.stringify(listMaint.body)).not.toContain(ADMIN_UID);

    mocks.listLiveNotices.mockResolvedValue([]);
    mocks.createNotice.mockResolvedValueOnce({ ...noticeByAdmin, id: 11, createdBy: maintUid });
    const createMaint = await call('POST', { q: 'notices' }, {
      op: 'create', title: '작성', body: '내용',
      startsAt: '2030-01-01T00:00:00.000Z', endsAt: '2030-01-02T00:00:00.000Z',
    });
    expect(createMaint).toMatchObject({
      status: 200,
      body: { notice: { id: 11, createdBy: expectedMaintHandle } },
    });
    expect(JSON.stringify(createMaint.body)).not.toContain(maintUid);

    mocks.updateNotice.mockResolvedValueOnce({ ...noticeByAdmin, id: 1, title: '수정' });
    const updateMaint = await call('POST', { q: 'notices' }, {
      op: 'update', id: 1, title: '수정', body: '내용',
      startsAt: '2030-01-01T00:00:00.000Z', endsAt: '2030-01-02T00:00:00.000Z',
    });
    expect(updateMaint).toMatchObject({
      status: 200,
      body: { notice: { id: 1, createdBy: expectedAdminHandle } },
    });
    expect(JSON.stringify(updateMaint.body)).not.toContain(ADMIN_UID);

    mocks.endNoticeNow.mockResolvedValueOnce({ ...noticeByAdmin, id: 1 });
    const endMaint = await call('POST', { q: 'notices' }, { op: 'end', id: 1 });
    expect(endMaint).toMatchObject({
      status: 200,
      body: { notice: { id: 1, createdBy: expectedAdminHandle } },
    });
    expect(JSON.stringify(endMaint.body)).not.toContain(ADMIN_UID);

    // admin은 원본 UUID 유지
    mocks.adminMember.mockResolvedValue({ role: 'admin', showStaffBadge: false });
    mocks.listAllAdminNotices.mockResolvedValueOnce([noticeByAdmin]);
    expect(await call('GET', { q: 'notices' })).toMatchObject({
      status: 200,
      body: [{ id: 1, createdBy: ADMIN_UID }],
    });
    mocks.createNotice.mockResolvedValueOnce({ ...noticeByAdmin, id: 12 });
    expect(await call('POST', { q: 'notices' }, {
      op: 'create', title: '관리자공지', body: '내용',
      startsAt: '2030-01-01T00:00:00.000Z', endsAt: '2030-01-02T00:00:00.000Z',
    })).toMatchObject({
      status: 200,
      body: { notice: { id: 12, createdBy: ADMIN_UID } },
    });
  });

  it('opHandle은 production에서 비밀키 미설정 시 오류를 던지고 비운영 환경에서는 폴백을 허용한다', () => {
    const prevDeploy = process.env.DEPLOY_ENV;
    const prevBetter = process.env.BETTER_AUTH_SECRET;
    const prevHandle = process.env.ADMIN_HANDLE_SECRET;
    try {
      delete process.env.BETTER_AUTH_SECRET;
      delete process.env.ADMIN_HANDLE_SECRET;
      process.env.DEPLOY_ENV = 'local';
      expect(opHandle(ADMIN_UID)).toMatch(/^op_[0-9a-f]{10}$/);

      process.env.DEPLOY_ENV = 'production';
      expect(() => opHandle(ADMIN_UID)).toThrow();

      process.env.ADMIN_HANDLE_SECRET = 'prod-handle-secret';
      expect(opHandle(ADMIN_UID)).toMatch(/^op_[0-9a-f]{10}$/);
    } finally {
      if (prevDeploy === undefined) delete process.env.DEPLOY_ENV; else process.env.DEPLOY_ENV = prevDeploy;
      if (prevBetter === undefined) delete process.env.BETTER_AUTH_SECRET; else process.env.BETTER_AUTH_SECRET = prevBetter;
      if (prevHandle === undefined) delete process.env.ADMIN_HANDLE_SECRET; else process.env.ADMIN_HANDLE_SECRET = prevHandle;
    }
  });

  it('computeUserAggregates는 클라이언트와 동일한 기준으로 활성·신규·골드·진행 분포를 집계한다', () => {
    const nowMs = Date.parse('2026-11-27T01:00:00.000Z'); // KST 2026-11-27 10:00:00
    const agg = computeUserAggregates([
      // 오늘 가입 정식 계정, 최근 활동, boat 1, fame 100 (< T2 250 정체)
      {
        user_id: 'u1', is_anonymous: false, signed_up_at: '2026-11-26T16:00:00.000Z', // KST 11-27 01:00
        gold: 1000, fame: 100, boat: 1, rod: 4, visited: ['village', 'world'],
        restricted: false, last_action_at: '2026-11-27T00:30:00.000Z', last_session_at: null,
      },
      // 3일 전 세션, boat 0, fame 0 (정식 계정이라 휴면 아님)
      {
        user_id: 'u2', is_anonymous: false, signed_up_at: '2026-11-20T00:00:00.000Z',
        gold: 200, fame: 0, boat: 0, rod: 2, visited: ['village'],
        restricted: false, last_action_at: null, last_session_at: '2026-11-24T01:00:00.000Z',
      },
      // 20일 전 활동, 제재 게스트 (제재돼서 휴면 게스트 제외 대상 아님), boat 2, fame 500 (< T3 1500 정체)
      {
        user_id: 'u3', is_anonymous: true, signed_up_at: '2026-11-01T00:00:00.000Z',
        gold: 0, fame: 0, boat: 2, rod: 3, visited: [],
        restricted: true, last_action_at: '2026-11-07T02:00:00.000Z', last_session_at: null,
      },
      // 오늘 가입 휴면 게스트(gold=0, fame=0, 비제재 익명) -> activePlayers에서 제외, gold 집계엔 포함
      {
        user_id: 'u4', is_anonymous: true, signed_up_at: '2026-11-26T18:00:00.000Z',
        gold: 0, fame: 0, boat: 0, rod: 1, visited: ['village'],
        restricted: false, last_action_at: '2026-11-26T18:00:00.000Z', last_session_at: null,
      },
      // 저장 없는 휴면 게스트 -> activePlayers 제외, gold 제외
      {
        user_id: 'u5', is_anonymous: true, signed_up_at: '2026-10-01T00:00:00.000Z',
        gold: null, fame: null, boat: null, rod: null, visited: null,
        restricted: null, last_action_at: null, last_session_at: null,
      },
    ], nowMs);

    expect(agg.totalUsers).toBe(5);
    expect(agg.activePlayers).toBe(3);
    expect(agg.activeUsers).toEqual({ today: 2, week: 3, month: 4 });
    expect(agg.newToday).toEqual({ users: 2, accounts: 1 });
    // goldValues = [0, 0, 200, 1000] -> sum 1200, p50 idx=1 -> 0, p75 idx=2 -> 200, max 1000
    expect(agg.gold).toEqual({ count: 4, sum: 1200, median: 0, p75: 200, max: 1000 });
    expect(agg.progression.boats).toEqual([
      { tier: 0, count: 1 }, { tier: 1, count: 1 }, { tier: 2, count: 1 },
      { tier: 3, count: 0 }, { tier: 4, count: 0 }, { tier: 5, count: 0 },
      { tier: 6, count: 0 }, { tier: 7, count: 0 }, { tier: 8, count: 0 }, { tier: 9, count: 0 },
    ]);
    expect(agg.progression.rods).toEqual([
      { level: 2, count: 1 }, { level: 3, count: 1 }, { level: 4, count: 1 },
    ]);
    expect(agg.progression.regionReach).toEqual([
      { id: 'village', count: 2 },
      { id: 'world', count: 1 },
    ]);
    expect(agg.progression.zoneUnlocks).toContainEqual({ id: 'village', count: 3 });
    expect(agg.progression.zoneUnlocks).toContainEqual({ id: 'pacific', count: 2 });
    expect(agg.progression.fameGateStalled).toEqual({
      total: 2,
      byNextTier: [{ nextTier: 2, count: 1 }, { nextTier: 3, count: 1 }],
    });
  });

  it('STAGE_ALLOWED_EMAILS가 설정되어도 public.admins 명부에 없는 테스터는 /api/admin* 호출 시 403으로 차단된다', async () => {
    process.env.STAGE_ALLOWED_EMAILS = 'tester@example.test';
    try {
      mocks.adminMember.mockResolvedValue(null);
      expect(await call('GET', { q: 'overview' })).toMatchObject({ status: 403, body: { error: 'forbidden' } });
      expect(await call('POST', { q: 'mail' }, {})).toMatchObject({ status: 403, body: { error: 'forbidden' } });
      expect(await call('GET', { q: 'access' })).toMatchObject({ status: 200, body: { kind: 'denied', uid: ADMIN_UID } });
    } finally {
      delete process.env.STAGE_ALLOWED_EMAILS;
    }
  });
});
