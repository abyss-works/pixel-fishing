// 관리자 읽기(HTTP 구현). 모든 조회가 서버 읽기 함수의 같은 이름 조회로 가고, 세션 토큰을 붙이며, 실패를 숨기지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ session: null as { access_token: string } | null }));
vi.mock('./auth', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: state.session } }) } },
}));

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
  ['imports', () => admin.imports(), '/api/admin?q=imports'],
  ['dexMismatch', () => admin.dexMismatch(), '/api/admin?q=dexMismatch'],
  ['recentEvents', () => admin.recentEvents(), '/api/admin?q=recentEvents'],
  ['userEvents', () => admin.userEvents('u-1', 300), '/api/admin?q=userEvents&user=u-1&limit=300'],
  ['letters', () => admin.letters(), '/api/admin?q=letters'],
  ['balanceLive', () => admin.balanceLive(3), '/api/admin?q=balanceLive&days=3'],
];

describe('HttpAdmin', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    state.session = { access_token: 'tok' };
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('조회마다 서버 읽기 함수에 같은 이름과 인자로 세션 토큰을 붙여 요청한다', async () => {
    for (const [method, call, url] of CALLS) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(new Response('[]', { status: 200 }));
      await call();
      expect(fetchMock, method).toHaveBeenCalledTimes(1);
      expect(fetchMock, method).toHaveBeenCalledWith(url, { headers: { authorization: 'Bearer tok' } });
    }
  });

  it('AdminApi의 모든 조회가 위 표에 있다. 서버 조회가 아닌 것은 projectRef뿐이다', () => {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(admin)).filter(m => m !== 'constructor' && m !== 'projectRef');
    expect(methods.sort()).toEqual(CALLS.map(([method]) => method).sort());
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

  it('세션이 없으면 접근 판정을 포함한 모든 조회가 서버를 부르지 않고 실패한다', async () => {
    state.session = null;
    for (const [method, call] of CALLS) await expect(call(), method).rejects.toThrow(/세션/);
    expect(fetchMock).not.toHaveBeenCalled();
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

  it('projectRef는 Supabase 주소의 호스트 이름 첫 마디다', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abcdwxyz.supabase.co');
    expect(admin.projectRef()).toBe('abcdwxyz');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect(admin.projectRef()).toBeNull();
    vi.stubEnv('VITE_SUPABASE_URL', 'not a url');
    expect(admin.projectRef()).toBeNull();
  });
});
