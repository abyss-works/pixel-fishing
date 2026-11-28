// 관리자 읽기(HTTP 구현). 모든 조회가 서버 읽기 함수의 조회 이름이나 관리자 REST 경로로 가고, 세션은 쿠키가 싣으며, 실패를 숨기지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createHttpApi } from './httpApi';

const admin = createHttpApi().admin;

/** AdminApi 조회와 그 조회가 보내는 요청 주소 */
const CALLS: [method: string, call: () => Promise<unknown>, url: string][] = [
  ['access', () => admin.access(), '/api/admin?q=access'],
  ['overview', () => admin.overview(30), '/api/admin?q=overview&days=30'],
  ['users', () => admin.users(), '/api/admin?q=users'],
  ['searchAdminUsers', () => admin.searchAdminUsers('홍길동', 25), '/api/admin?q=userSearch&term=%ED%99%8D%EA%B8%B8%EB%8F%99&limit=25'],
  ['live', () => admin.live(), '/api/admin/live'],
  ['dailyStats', () => admin.dailyStats('2026-10-07', '2026-11-05'), '/api/admin/stats/daily?from=2026-10-07&to=2026-11-05'],
  ['retention', () => admin.retention(), '/api/admin/retention'],
  ['sessions', () => admin.sessions('u-1', 20), '/api/admin/sessions?user=u-1&limit=20'],
  ['economy', () => admin.economy(90), '/api/admin?q=economy&days=90'],
  ['bountyFunnel', () => admin.bountyFunnel(7), '/api/admin?q=bountyFunnel&days=7'],
  ['onboardingFunnel', () => admin.onboardingFunnel(), '/api/admin?q=onboardingFunnel'],
  ['httpMetrics', () => admin.httpMetrics(30), '/api/admin?q=httpMetrics&days=30'],
  ['clientMetrics', () => admin.clientMetrics(7), '/api/admin?q=clientMetrics&days=7'],
  ['opsHealth', () => admin.opsHealth(7), '/api/admin?q=opsHealth&days=7'],
  ['spamFlags', () => admin.spamFlags(), '/api/admin?q=spamFlags'],
  ['recentEvents', () => admin.recentEvents(), '/api/admin?q=recentEvents'],
  ['userEvents', () => admin.userEvents('u-1', 300), '/api/admin?q=userEvents&user=u-1&limit=300'],
  ['userState', () => admin.userState('u-1'), '/api/admin?q=userState&uid=u-1'],
  ['letters', () => admin.letters(), '/api/admin?q=letters'],
  ['changelog', () => admin.changelog(), '/api/admin?q=changelog'],
  ['chatReports', () => admin.chatReports(), '/api/admin?q=chatReports'],
  ['notices', () => admin.notices(), '/api/admin?q=notices'],
  ['coupons', () => admin.coupons(), '/api/admin?q=coupons'],
  ['balanceLive', () => admin.balanceLive(3), '/api/admin?q=balanceLive&days=3'],
  ['sentMails', () => admin.sentMails(), '/api/admin?q=mails'],
  ['readIntegrityStages', () => admin.readIntegrityStages(), '/api/admin?q=integrityStages'],
  ['readIntegrityEvents', () => admin.readIntegrityEvents('u-1', 50), '/api/admin?q=integrityEvents&user=u-1&limit=50'],
  ['readIntegrityMetrics', () => admin.readIntegrityMetrics(14), '/api/admin?q=integrityMetrics&days=14'],
];

describe('HttpAdmin', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('조회마다 서버 읽기 함수에 같은 이름과 인자로 요청한다. 인증 헤더는 붙이지 않는다', async () => {
    for (const [method, call, url] of CALLS) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(new Response('[]', { status: 200 }));
      await call();
      expect(fetchMock, method).toHaveBeenCalledTimes(1);
      expect(fetchMock, method).toHaveBeenCalledWith(url);
    }
  });

  it('AdminApi의 모든 조회가 위 표에 있다. 서버 조회가 아닌 것은 deployHost, 쓰기(mail·restrict·letterHandled·revokeSessions·writeNotice·writeCoupon·setStaffBadge·releaseIntegrityStage), 관리자 로그인·로그아웃·로그인 복귀뿐이다', () => {
    const writes = ['constructor', 'deployHost', 'mail', 'restrict', 'letterHandled', 'revokeSessions', 'writeNotice', 'writeCoupon', 'setStaffBadge', 'releaseIntegrityStage', 'signIn', 'signOut', 'takeSignInReturn'];
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(admin))
      .filter(m => !writes.includes(m));
    expect(methods.sort()).toEqual(CALLS.map(([method]) => method).sort());
  });

  it('우편 쓰기는 POST로 op와 요청(items 포함)을 보낸다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ problems: [], preview: { count: 1, totalGold: 5, missing: [] } }), { status: 200 }));
    const request = {
      title: 't', body: 'b',
      target: { kind: 'all' as const, gold: 0, items: [{ id: 'luck-small', qty: 2 }] },
    };
    const plan = await admin.mail('preview', request);
    expect(plan.preview?.count).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin?q=mail', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'preview', request }),
    });
  });

  it('sentMails는 응답의 items·hats 배열을 정규화해 매핑한다', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([
      {
        id: 1, userId: 'u-1', title: '선물', body: 'b', gold: 0,
        items: [{ id: 'luck-small', qty: 3 }],
        hats: ['santa-hat'],
        createdAt: '2026-11-25T00:00:00.000Z', readAt: null, claimedAt: null,
      },
      {
        id: 2, userId: 'u-2', title: '구버전', body: 'b', gold: 100,
        createdAt: '2026-11-24T00:00:00.000Z', readAt: null, claimedAt: null,
      },
    ]), { status: 200 }));
    const rows = await admin.sentMails();
    expect(rows[0].items).toEqual([{ id: 'luck-small', qty: 3 }]);
    expect(rows[0].hats).toEqual(['santa-hat']);
    expect(rows[1].items).toEqual([]);
    expect(rows[1].hats).toEqual([]);
  });

  it('제재·편지 처리·세션 강제 종료는 POST로 인자를 보내고, 실패하면 작업 이름과 서버 오류 코드를 담아 던진다', async () => {
    const post = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ restricted: true }), { status: 200 }));
    await expect(admin.restrict('u-1', true)).resolves.toEqual({ restricted: true });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin?q=restrict', post({ userId: 'u-1', restricted: true }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'no-save' }), { status: 404 }));
    await expect(admin.restrict('u-1', false)).rejects.toThrow('제재 해제 실패: 404 no-save');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ handled: true }), { status: 200 }));
    await expect(admin.letterHandled(3, true)).resolves.toEqual({ handled: true });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin?q=letterHandled', post({ letterId: 3, handled: true }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ revoked: 2 }), { status: 200 }));
    await expect(admin.revokeSessions('u-1')).resolves.toEqual({ revoked: 2 });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin?q=revokeSessions', post({ userId: 'u-1' }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'no-user' }), { status: 404 }));
    await expect(admin.revokeSessions('u-1')).rejects.toThrow('세션 강제 종료 실패: 404 no-user');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ notice: { id: 7 } }), { status: 200 }));
    await expect(admin.writeNotice({
      op: 'create', title: '공지', body: '내용',
      startsAt: '2026-11-26T00:00:00.000Z', endsAt: '2026-11-27T00:00:00.000Z',
    })).resolves.toEqual({ notice: { id: 7 } });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin?q=notices', post({
      op: 'create', title: '공지', body: '내용',
      startsAt: '2026-11-26T00:00:00.000Z', endsAt: '2026-11-27T00:00:00.000Z',
    }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'bad-window' }), { status: 400 }));
    await expect(admin.writeNotice({ op: 'end', id: 7 })).rejects.toThrow('공지 end 실패: 400 bad-window');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ coupon: { code: 'C1' } }), { status: 200 }));
    await expect(admin.writeCoupon({
      op: 'create', code: 'C1', gold: 100, items: [], description: '설명',
    })).resolves.toEqual({ coupon: { code: 'C1' } });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin?q=coupons', post({
      op: 'create', code: 'C1', gold: 100, items: [], description: '설명',
    }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'duplicate-coupon' }), { status: 409 }));
    await expect(admin.writeCoupon({ op: 'delete', code: 'C1' })).rejects.toThrow('쿠폰 delete 실패: 409 duplicate-coupon');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ showStaffBadge: true }), { status: 200 }));
    await expect(admin.setStaffBadge(true)).resolves.toEqual({ showStaffBadge: true });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin?q=staffBadge', post({ show: true }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }));
    await expect(admin.setStaffBadge(false)).rejects.toThrow('운영진 표시 설정 실패: 403 forbidden');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ released: true }), { status: 200 }));
    await expect(admin.releaseIntegrityStage('u-1')).resolves.toEqual({ released: true });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin?q=integrityRelease', post({ userId: 'u-1' }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'no-user' }), { status: 404 }));
    await expect(admin.releaseIntegrityStage('u-1')).rejects.toThrow('추첨 가중치 초기화 실패: 404 no-user');
  });

  it('sessions는 생략한 인자를 보내지 않는다', async () => {
    fetchMock.mockImplementation(async () => new Response('[]', { status: 200 }));
    await admin.sessions(undefined, 500);
    await admin.sessions();
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/admin/sessions?limit=500', '/api/admin/sessions']);
  });

  it('userEvents는 건수를 생략하면 500건을 요청한다', async () => {
    fetchMock.mockResolvedValue(new Response('[]', { status: 200 }));
    await admin.userEvents('u-1');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin?q=userEvents&user=u-1&limit=500');
  });

  it('balanceLive는 기간을 생략하면 기간 인자 없이 요청해 서버의 기본 기간을 따른다', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await admin.balanceLive();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin?q=balanceLive');
  });

  it('httpMetrics는 기간을 생략하면 기간 인자 없이 요청해 서버의 기본 기간을 따른다', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await admin.httpMetrics();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin?q=httpMetrics');
  });

  it('clientMetrics는 기간을 생략하면 기간 인자 없이 요청해 서버의 기본 기간을 따른다', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await admin.clientMetrics();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin?q=clientMetrics');
  });

  it('readIntegrityEvents는 생략한 인자를 보내지 않는다', async () => {
    fetchMock.mockImplementation(async () => new Response('[]', { status: 200 }));
    await admin.readIntegrityEvents(undefined, 200);
    await admin.readIntegrityEvents();
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      '/api/admin?q=integrityEvents&limit=200',
      '/api/admin?q=integrityEvents',
    ]);
  });

  it('readIntegrityMetrics는 기간을 생략하면 기간 인자 없이 요청해 서버의 기본 기간을 따른다', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await admin.readIntegrityMetrics();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin?q=integrityMetrics');
  });

  it('opsHealth는 기간을 생략하면 기간 인자 없이 요청해 서버의 기본 기간을 따른다', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await admin.opsHealth();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin?q=opsHealth');
  });

  it('서버 응답 본문을 그대로 돌려준다', async () => {
    const rows = [{ day: '2026-10-18', size: 3, d1: 0.5, d7: null, d30: null }];
    fetchMock.mockResolvedValue(new Response(JSON.stringify(rows), { status: 200 }));
    await expect(admin.retention()).resolves.toEqual(rows);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ kind: 'denied', uid: 'u-1' }), { status: 200 }));
    await expect(admin.access()).resolves.toEqual({ kind: 'denied', uid: 'u-1' });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ kind: 'granted', uid: 'u-2', role: 'maintainer', showStaffBadge: true }), { status: 200 }));
    await expect(admin.access()).resolves.toEqual({ kind: 'granted', uid: 'u-2', role: 'maintainer', showStaffBadge: true });
    const live = { boats: [{ boat: 0, users: 2 }], gold: { p25: null, max: null }, anomalies: { fastGaps: 0, fastUsers: 0, perfectPct: null } };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(live), { status: 200 }));
    await expect(admin.balanceLive(7)).resolves.toEqual(live);
    const overview = {
      users: [],
      userAggregates: {
        totalUsers: 5,
        activePlayers: 3,
        asOf: '2026-11-27T01:00:00.000Z',
        activeUsers: { today: 1, week: 2, month: 3 },
        newToday: { users: 1, accounts: 1 },
        gold: { count: 4, sum: 1500, median: 300, p75: 500, max: 1000 },
        progression: {
          boats: [{ tier: 0, count: 1 }, { tier: 1, count: 2 }],
          rods: [{ level: 2, count: 1 }, { level: 4, count: 2 }],
          regionReach: [{ id: 'village', count: 3 }, { id: 'world', count: 2 }],
          zoneUnlocks: [{ id: 'village', count: 3 }, { id: 'pacific', count: 2 }],
          fameGateStalled: { total: 1, byNextTier: [{ nextTier: 2, count: 1 }] },
        },
      },
      recentEvents: [],
      spamFlags: [],
      dailyStats: [],
      retention: [],
      sessions: [],
      live: { count: 0, online: [] },
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(overview), { status: 200 }));
    await expect(admin.overview(30)).resolves.toEqual(overview);
  });

  it('관리자 세션이 없어 서버가 거절하면(401) 접근 판정은 signedOut이고 나머지 조회는 실패한다', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }));
    await expect(admin.access()).resolves.toEqual({ kind: 'signedOut', uid: null });
    for (const [method, call] of CALLS.filter(([m]) => m !== 'access')) await expect(call(), method).rejects.toThrow('401 unauthorized');
  });

  it('접근 판정이 401 외의 이유로 실패하면 던진다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'db-read' }), { status: 500 }));
    await expect(admin.access()).rejects.toThrow('access 조회 실패: 500 db-read');
  });

  it('클라우드 구현이라 관리자 로그인이 필요하다', () => {
    expect(admin.isConfigured).toBe(true);
  });

  describe('관리자 구글 로그인', () => {
    const post = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const assign = vi.fn();
    const RETURN = `${window.location.origin}/admin/?google=sign-in`;
    beforeEach(() => {
      assign.mockReset();
      sessionStorage.clear();
      vi.stubGlobal('location', { origin: window.location.origin, assign });
    });

    it('관리자 인증 경로에 구글 로그인을 시작하고 받은 주소로 이동한다. 성공과 실패의 복귀 주소는 같다', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ url: 'https://accounts.example.test/auth', redirect: false }), { status: 200 }));
      await expect(admin.signIn()).resolves.toEqual({ ok: true });
      expect(fetchMock).toHaveBeenLastCalledWith('/api/admin/auth/sign-in/social',
        post({ provider: 'google', callbackURL: RETURN, errorCallbackURL: RETURN, disableRedirect: true }));
      expect(assign).toHaveBeenCalledWith('https://accounts.example.test/auth');
    });

    it('시작하지 못하면 이동하지 않고 안내 문구를 돌려준다', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
      await expect(admin.signIn()).resolves.toEqual({ ok: false, msg: '구글 인증 주소를 받지 못했어요.' });
      fetchMock.mockResolvedValue(new Response('', { status: 429 }));
      await expect(admin.signIn()).resolves.toEqual({ ok: false, msg: '요청이 너무 잦아요.\n잠시 뒤 다시 시도해 주세요.' });
      fetchMock.mockResolvedValue(new Response('', { status: 502 }));
      await expect(admin.signIn()).resolves.toEqual({
        ok: false, msg: '구글 계정 선택 화면을 열지 못했어요.\n서버에서 502 응답을 받았어요.\n잠시 뒤 다시 시도해 주세요.',
      });
      fetchMock.mockResolvedValue(new Response('', { status: 500 }));
      await expect(admin.signIn()).resolves.toEqual({
        ok: false, msg: '구글 계정 선택 화면을 열지 못했어요.\n서버에서 500 응답을 받았어요.\n잠시 뒤 다시 시도해 주세요.',
      });
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(admin.signIn()).resolves.toEqual({ ok: false, msg: '구글 계정 선택 화면을 열지 못했어요.\n네트워크를 확인해 주세요.' });
      expect(assign).not.toHaveBeenCalled();
    });

    it('세션 저장소를 쓸 수 없으면 이동하지 않는다', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ url: 'https://accounts.example.test/auth' }), { status: 200 }));
      const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
      try {
        await expect(admin.signIn()).resolves.toEqual({ ok: false, msg: '브라우저 저장소를 쓸 수 없어요.' });
      } finally {
        set.mockRestore();
      }
      expect(assign).not.toHaveBeenCalled();
    });
  });

  describe('관리자 구글 로그인 복귀', () => {
    const land = (search: string) => window.history.replaceState(null, '', `/admin/${search}#/admin/overview`);
    beforeEach(() => sessionStorage.clear());
    afterEach(() => window.history.replaceState(null, '', '/'));

    it('이 탭에서 시작한 흐름이면 서버가 붙인 결과 코드를 돌려주고 주소의 두 질의를 지운다', () => {
      sessionStorage.setItem('pf-admin-google-flow', 'sign-in');
      land('?google=sign-in&error=signup_disabled');
      expect(admin.takeSignInReturn()).toEqual({ error: 'signup_disabled' });
      expect(window.location.search).toBe('');
      expect(window.location.hash).toBe('#/admin/overview');
      expect(sessionStorage.getItem('pf-admin-google-flow')).toBeNull();
    });

    it('오류 없는 복귀는 error가 null이다', () => {
      sessionStorage.setItem('pf-admin-google-flow', 'sign-in');
      land('?google=sign-in');
      expect(admin.takeSignInReturn()).toEqual({ error: null });
    });

    it('error가 비어 있으면 빈 코드로 돌려준다(오류 없음과 구분한다)', () => {
      sessionStorage.setItem('pf-admin-google-flow', 'sign-in');
      land('?google=sign-in&error=');
      expect(admin.takeSignInReturn()).toEqual({ error: '' });
      expect(window.location.search).toBe('');
    });

    it('error_description도 함께 지우고 다른 질의와 해시는 보존한다', () => {
      sessionStorage.setItem('pf-admin-google-flow', 'sign-in');
      land('?tab=users&google=sign-in&error=access_denied&error_description=denied+by+user');
      expect(admin.takeSignInReturn()).toEqual({ error: 'access_denied' });
      expect(window.location.search).toBe('?tab=users');
      expect(window.location.hash).toBe('#/admin/overview');
    });

    it('error_description만 붙은 복귀는 오류 없음이고 그 질의를 지운다', () => {
      sessionStorage.setItem('pf-admin-google-flow', 'sign-in');
      land('?google=sign-in&error_description=denied');
      expect(admin.takeSignInReturn()).toEqual({ error: null });
      expect(window.location.search).toBe('');
    });

    it('표지 질의 없이 열렸는데 이 탭의 세션 저장소 표지가 남아 있으면 표지를 지우고 무시한다', () => {
      sessionStorage.setItem('pf-admin-google-flow', 'sign-in');
      land('?tab=users');
      expect(admin.takeSignInReturn()).toBeNull();
      expect(sessionStorage.getItem('pf-admin-google-flow')).toBeNull();
      expect(window.location.search).toBe('?tab=users');
    });

    it('세션 저장소를 읽거나 지우다 예외가 나도 안내 없이 무시한다', () => {
      const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
      const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
      try {
        land('');
        expect(admin.takeSignInReturn()).toBeNull();
        land('?google=sign-in&error=signup_disabled');
        expect(admin.takeSignInReturn()).toBeNull();
        expect(window.location.search).toBe('');
      } finally {
        get.mockRestore();
        remove.mockRestore();
      }
    });

    it('이 탭에서 시작하지 않았으면 질의만 지우고 무시한다', () => {
      land('?google=sign-in&error=signup_disabled');
      expect(admin.takeSignInReturn()).toBeNull();
      expect(window.location.search).toBe('');
    });
  });

  it('관리자 로그아웃은 관리자 인증 경로에만 보낸다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await admin.signOut();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/auth/sign-out',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  });

  it('실패 응답은 상태와 서버 오류 코드를 담아 던진다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }));
    await expect(admin.users()).rejects.toThrow('users 조회 실패: 403 forbidden');
    fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(admin.letters()).rejects.toThrow('letters 조회 실패: 502');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'bad-days' }), { status: 400 }));
    await expect(admin.balanceLive(1.5)).rejects.toThrow('balanceLive 조회 실패: 400 bad-days');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'bad-range' }), { status: 400 }));
    await expect(admin.dailyStats('2026-01-01', '2026-11-05')).rejects.toThrow('stats/daily 조회 실패: 400 bad-range');
  });

  it('네트워크 오류는 그대로 던진다', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(admin.retention()).rejects.toThrow('Failed to fetch');
  });

  it('deployHost는 이 화면이 붙은 주소의 호스트다', () => {
    expect(admin.deployHost()).toBe(window.location.hostname);
  });

  describe('429 백오프 및 비-JSON 오류 처리', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('비-JSON HTML 429 응답과 Retry-After 헤더가 오면 대기 후 제한 횟수 내 재시도해 복구한다', async () => {
      vi.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(new Response('<html><body>429 Too Many Requests</body></html>', {
          status: 429,
          headers: { 'content-type': 'text/html', 'retry-after': '1' },
        }))
        .mockResolvedValueOnce(new Response(JSON.stringify([{ user_id: 'u-1' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));

      const promise = admin.users();
      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(promise).resolves.toEqual([{ user_id: 'u-1' }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('429 재시도 상한을 넘기면 JSON 파싱 오류 대신 명확한 안내 문구를 던진다', async () => {
      vi.useFakeTimers();
      fetchMock.mockImplementation(async () => new Response('<html>429 Too Many Requests</html>', {
        status: 429,
        headers: { 'content-type': 'text/html', 'retry-after': '0' },
      }));

      const promise = admin.users();
      const caught = promise.catch(e => e);
      await vi.runAllTimersAsync();
      const err = await caught;
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe('요청이 너무 많아 잠시 기다렸다가 다시 시도해 주세요.');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('401과 403은 재시도 없이 즉시 실패한다', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }));
      await expect(admin.users()).rejects.toThrow('users 조회 실패: 403 forbidden');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }));
      await expect(admin.users()).rejects.toThrow('users 조회 실패: 401 unauthorized');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('POST 쓰기가 비-JSON 429 응답을 받으면 재시도하지 않고 안내 문구를 던진다', async () => {
      fetchMock.mockResolvedValueOnce(new Response('<html>429</html>', { status: 429, headers: { 'content-type': 'text/html' } }));
      await expect(admin.restrict('u-1', true)).rejects.toThrow('요청이 너무 많아 잠시 기다렸다가 다시 시도해 주세요.');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('200 응답이 비-JSON HTML이면 원인 오류 메시지를 던진다', async () => {
      fetchMock.mockResolvedValueOnce(new Response('<html>fallback</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
      await expect(admin.users()).rejects.toThrow('users 응답이 올바른 JSON 형식이 아니에요.');
    });
  });
});
