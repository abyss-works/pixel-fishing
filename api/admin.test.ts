// 관리자 핸들러 단위 테스트 — DB/컨테이너 없이 사문화 ?q= 제거, userState 검증, 우편 안전장치(409 duplicate-mail·멱등·상한)를 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_UID = '00000000-0000-4000-8000-000000000901';
const TARGET_UID = '00000000-0000-4000-8000-000000000902';

const mocks = vi.hoisted(() => ({
  adminSessionUid: vi.fn(async () => ADMIN_UID),
  isAdmin: vi.fn(async () => true),
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
    summary: { total: 0, status426: 0, status429: 0, status5xx: 0, rate426: 0, rate429: 0, rate5xx: 0 },
    daily: [],
    byRoute: [],
    rows: [],
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
  withTransaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(mocks.db)),
}));

vi.mock('./_auth/session.js', () => ({
  adminSessionUid: mocks.adminSessionUid,
}));
vi.mock('./_db/client.js', () => ({
  database: () => ({ db: mocks.db, withTransaction: mocks.withTransaction }),
}));
vi.mock('./_data/admin.js', async () => {
  const actual = await vi.importActual<typeof import('./_data/admin.js')>('./_data/admin.js');
  return {
    ...actual,
    isAdmin: mocks.isAdmin,
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
    mocks.isAdmin.mockResolvedValue(true);
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
      .mockResolvedValueOnce({ rows: [{ id: TARGET_UID }] }) // previewMails
      .mockResolvedValueOnce({ rows: [{ found: false }] })   // hasRecentDuplicateMail
      .mockResolvedValueOnce({ rows: [{ n: 1 }] });          // sendMails
    mocks.notifyUser.mockClear();
    const first = await call('POST', { q: 'mail' }, { op: 'send', request: mailReq, idempotencyKey: key });
    expect(first).toMatchObject({ status: 200, body: { sent: 1, problems: [] } });
    expect(mocks.notifyUser).toHaveBeenCalledTimes(1);
    expect(mocks.notifyUser).toHaveBeenCalledWith(TARGET_UID, { t: 'mail' });

    const replay = await call('POST', { q: 'mail' }, { op: 'send', request: mailReq, idempotencyKey: key });
    expect(replay).toMatchObject({ status: 200, body: { sent: 0, idempotent: true } });
    expect(mocks.notifyUser).toHaveBeenCalledTimes(1);

    // 다른 키로 10분 내 동일 우편 재시도 시 DB 중복 창이 409 duplicate-mail로 차단
    mocks.db.execute
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
    expect(mocks.overview).toHaveBeenCalledWith(mocks.db, 30, expect.any(Array));

    await call('GET', { q: 'overview', days: '7' });
    expect(mocks.overview).toHaveBeenLastCalledWith(mocks.db, 7, expect.any(Array));
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
    expect(mocks.notifyUser).toHaveBeenCalledWith(TARGET_UID, { t: 'mail' });

    expect(await call('POST', { q: 'coupons' }, { op: 'create', code: '출항준비', gold: 100, description: '차단' })).toMatchObject({
      status: 400,
      body: { error: 'bad-coupon' },
    });
    mocks.createAdminCoupon.mockResolvedValueOnce('duplicate');
    expect(await call('POST', { q: 'coupons' }, {
      op: 'create',
      code: 'DUP-CODE',
      gold: 100,
      description: '중복',
    })).toMatchObject({ status: 409, body: { error: 'duplicate-coupon' } });
  });
});
