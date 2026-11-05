// 관리자 읽기(HTTP 구현). 모든 조회가 서버 읽기 함수의 같은 이름 조회로 가고, 세션은 쿠키가 싣으며, 실패를 숨기지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createHttpApi } from './httpApi';

const admin = createHttpApi().admin;

/** AdminApi 조회와 그 조회가 서버 읽기 함수로 보내는 요청 주소 */
const CALLS: [method: string, call: () => Promise<unknown>, url: string][] = [
  ['access', () => admin.access(), '/api/admin?q=access'],
  ['users', () => admin.users(), '/api/admin?q=users'],
  ['dailyActive', () => admin.dailyActive(30), '/api/admin?q=dailyActive&days=30'],
  ['retention', () => admin.retention(), '/api/admin?q=retention'],
  ['economy', () => admin.economy(90), '/api/admin?q=economy&days=90'],
  ['bountyFunnel', () => admin.bountyFunnel(7), '/api/admin?q=bountyFunnel&days=7'],
  ['catchQuality', () => admin.catchQuality(30), '/api/admin?q=catchQuality&days=30'],
  ['spamFlags', () => admin.spamFlags(), '/api/admin?q=spamFlags'],
  ['recentEvents', () => admin.recentEvents(), '/api/admin?q=recentEvents'],
  ['userEvents', () => admin.userEvents('u-1', 300), '/api/admin?q=userEvents&user=u-1&limit=300'],
  ['letters', () => admin.letters(), '/api/admin?q=letters'],
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

  it('AdminApi의 모든 조회가 위 표에 있다. 서버 조회가 아닌 것은 deployHost와 우편 쓰기(mail)뿐이다', () => {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(admin))
      .filter(m => m !== 'constructor' && m !== 'deployHost' && m !== 'mail');
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
    const rows = [{ day: '2026-10-18', dau: 3, wau7: 5 }];
    fetchMock.mockResolvedValue(new Response(JSON.stringify(rows), { status: 200 }));
    await expect(admin.dailyActive(7)).resolves.toEqual(rows);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ kind: 'denied', uid: 'u-1' }), { status: 200 }));
    await expect(admin.access()).resolves.toEqual({ kind: 'denied', uid: 'u-1' });
    const live = { boats: [{ boat: 0, users: 2 }], gold: { p25: null, max: null }, anomalies: { fastGaps: 0, fastUsers: 0, perfectPct: null } };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(live), { status: 200 }));
    await expect(admin.balanceLive(7)).resolves.toEqual(live);
  });

  it('세션이 없어 서버가 거절하면(401) 접근 판정을 포함한 모든 조회가 실패한다', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }));
    for (const [method, call] of CALLS) await expect(call(), method).rejects.toThrow('401 unauthorized');
  });

  it('실패 응답은 상태와 서버 오류 코드를 담아 던진다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }));
    await expect(admin.users()).rejects.toThrow('users 조회 실패: 403 forbidden');
    fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(admin.letters()).rejects.toThrow('letters 조회 실패: 502');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'bad-days' }), { status: 400 }));
    await expect(admin.balanceLive(1.5)).rejects.toThrow('balanceLive 조회 실패: 400 bad-days');
  });

  it('네트워크 오류는 그대로 던진다', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(admin.retention()).rejects.toThrow('Failed to fetch');
  });

  it('deployHost는 이 화면이 붙은 주소의 호스트다', () => {
    expect(admin.deployHost()).toBe(window.location.hostname);
  });
});
