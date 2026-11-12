// 관리자 읽기(HTTP 구현). 모든 조회가 서버 읽기 함수의 조회 이름이나 관리자 REST 경로로 가고, 세션은 쿠키가 싣으며, 실패를 숨기지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createHttpApi } from './httpApi';

const admin = createHttpApi().admin;

/** AdminApi 조회와 그 조회가 보내는 요청 주소 */
const CALLS: [method: string, call: () => Promise<unknown>, url: string][] = [
  ['access', () => admin.access(), '/api/admin?q=access'],
  ['users', () => admin.users(), '/api/admin?q=users'],
  ['live', () => admin.live(), '/api/admin/live'],
  ['dailyStats', () => admin.dailyStats('2026-10-07', '2026-11-05'), '/api/admin/stats/daily?from=2026-10-07&to=2026-11-05'],
  ['retention', () => admin.retention(), '/api/admin/retention'],
  ['sessions', () => admin.sessions('u-1', 20), '/api/admin/sessions?user=u-1&limit=20'],
  ['economy', () => admin.economy(90), '/api/admin?q=economy&days=90'],
  ['bountyFunnel', () => admin.bountyFunnel(7), '/api/admin?q=bountyFunnel&days=7'],
  ['spamFlags', () => admin.spamFlags(), '/api/admin?q=spamFlags'],
  ['recentEvents', () => admin.recentEvents(), '/api/admin?q=recentEvents'],
  ['userEvents', () => admin.userEvents('u-1', 300), '/api/admin?q=userEvents&user=u-1&limit=300'],
  ['letters', () => admin.letters(), '/api/admin?q=letters'],
  ['changelog', () => admin.changelog(), '/api/admin?q=changelog'],
  ['chatReports', () => admin.chatReports(), '/api/admin?q=chatReports'],
  ['balanceLive', () => admin.balanceLive(3), '/api/admin?q=balanceLive&days=3'],
  ['sentMails', () => admin.sentMails(), '/api/admin?q=mails'],
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

  it('AdminApi의 모든 조회가 위 표에 있다. 서버 조회가 아닌 것은 deployHost, 쓰기(mail·restrict·resetLink·letterHandled), 관리자 로그인·로그아웃·로그인 복귀뿐이다', () => {
    const writes = ['constructor', 'deployHost', 'mail', 'restrict', 'resetLink', 'letterHandled', 'signIn', 'signOut', 'takeSignInReturn'];
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(admin))
      .filter(m => !writes.includes(m));
    expect(methods.sort()).toEqual(CALLS.map(([method]) => method).sort());
  });

  it('우편 쓰기는 POST로 op와 요청을 보낸다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ problems: [], preview: { count: 1, totalGold: 5, missing: [] } }), { status: 200 }));
    const request = { title: 't', body: 'b', target: { kind: 'all' as const, gold: 5 } };
    const plan = await admin.mail('preview', request);
    expect(plan.preview?.count).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin?q=mail', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'preview', request }),
    });
  });

  it('제재와 재설정 링크 발급은 POST로 계정 id를 보내고, 실패하면 작업 이름과 서버 오류 코드를 담아 던진다', async () => {
    const post = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ restricted: true }), { status: 200 }));
    await expect(admin.restrict('u-1', true)).resolves.toEqual({ restricted: true });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin?q=restrict', post({ userId: 'u-1', restricted: true }));
    const link = { url: 'https://example.test/?token=abc', expiresAt: '2026-11-05T01:00:00.000Z' };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(link), { status: 200 }));
    await expect(admin.resetLink('u-1')).resolves.toEqual(link);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin?q=resetLink', post({ userId: 'u-1' }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'anonymous-user' }), { status: 409 }));
    await expect(admin.resetLink('u-1')).rejects.toThrow('재설정 링크 발급 실패: 409 anonymous-user');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'no-save' }), { status: 404 }));
    await expect(admin.restrict('u-1', false)).rejects.toThrow('제재 해제 실패: 404 no-save');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ handled: true }), { status: 200 }));
    await expect(admin.letterHandled(3, true)).resolves.toEqual({ handled: true });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin?q=letterHandled', post({ letterId: 3, handled: true }));
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

  it('서버 응답 본문을 그대로 돌려준다', async () => {
    const rows = [{ day: '2026-10-18', size: 3, d1: 0.5, d7: null, d30: null }];
    fetchMock.mockResolvedValue(new Response(JSON.stringify(rows), { status: 200 }));
    await expect(admin.retention()).resolves.toEqual(rows);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ kind: 'denied', uid: 'u-1' }), { status: 200 }));
    await expect(admin.access()).resolves.toEqual({ kind: 'denied', uid: 'u-1' });
    const live = { boats: [{ boat: 0, users: 2 }], gold: { p25: null, max: null }, anomalies: { fastGaps: 0, fastUsers: 0, perfectPct: null } };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(live), { status: 200 }));
    await expect(admin.balanceLive(7)).resolves.toEqual(live);
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
      await expect(admin.signIn()).resolves.toEqual({ ok: false, msg: '요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.' });
      fetchMock.mockResolvedValue(new Response('', { status: 502 }));
      await expect(admin.signIn()).resolves.toEqual({ ok: false, msg: '로그인하지 못했어요. (502)' });
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(admin.signIn()).resolves.toEqual({ ok: false, msg: '로그인하지 못했어요. 네트워크를 확인해 주세요.' });
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

    it('이 탭에서 시작하지 않았거나 표지가 없으면 질의만 지우고 무시한다', () => {
      land('?google=sign-in&error=signup_disabled');
      expect(admin.takeSignInReturn()).toBeNull();
      expect(window.location.search).toBe('');
      land('');
      sessionStorage.setItem('pf-admin-google-flow', 'sign-in');
      expect(admin.takeSignInReturn()).toBeNull();
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
});
