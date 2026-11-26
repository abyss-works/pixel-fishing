// 구글 연결과 로그인의 시작 요청, 복귀 주소 읽기를 클라우드 빌드에서 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({
  $fetch: vi.fn(),
  getSession: vi.fn(),
}));

async function load() {
  vi.resetModules();
  vi.stubEnv('VITE_CLOUD', '1');
  vi.doMock('better-auth/client', () => ({ createAuthClient: () => client }));
  vi.doMock('better-auth/client/plugins', () => ({ anonymousClient: () => ({}) }));
  return import('./auth');
}

const assign = vi.fn();
const original = window.location;

function setLocation(search: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      origin: 'https://game.test', pathname: '/', search, hash: '',
      href: `https://game.test/${search}`, assign,
    },
  });
}

beforeEach(() => {
  client.$fetch.mockReset();
  assign.mockReset();
  sessionStorage.clear();
  setLocation('');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('better-auth/client');
  vi.doUnmock('better-auth/client/plugins');
  Object.defineProperty(window, 'location', { configurable: true, value: original });
});

describe('구글 인증 시작', () => {
  it('연결은 link-social에 같은 출처의 복귀 주소를 두 곳에 실어 보내고 받은 주소로 이동한다', async () => {
    const auth = await load();
    client.$fetch.mockResolvedValue({ data: { url: 'https://accounts.google.test/auth?state=s', redirect: false }, error: null });
    expect(await auth.startGoogleAuth('link', 'link-guest')).toEqual({ ok: true });
    expect(client.$fetch).toHaveBeenCalledWith('/link-social', {
      method: 'POST',
      body: {
        provider: 'google',
        callbackURL: 'https://game.test/?google=link-guest',
        errorCallbackURL: 'https://game.test/?google=link-guest',
        disableRedirect: true,
      },
    });
    expect(assign).toHaveBeenCalledWith('https://accounts.google.test/auth?state=s');
  });

  it('시작할 때 이 기기에서 시작했다는 표지를 세션 저장소에 한 번 남긴다', async () => {
    const auth = await load();
    client.$fetch.mockResolvedValue({ data: { url: 'https://accounts.google.test/auth' }, error: null });
    await auth.startGoogleAuth('link', 'link-guest');
    expect(sessionStorage.getItem('pf-google-flow')).toBe('link-guest');
  });

  it('세션 저장소에 쓰지 못하면 이동하지 않고 실패로 알린다', async () => {
    const auth = await load();
    client.$fetch.mockResolvedValue({ data: { url: 'https://accounts.google.test/auth' }, error: null });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const r = await auth.startGoogleAuth('link', 'link-guest');
    write.mockRestore();
    expect(r.ok).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it('시작하지 못하면 표지를 남기지 않는다', async () => {
    const auth = await load();
    client.$fetch.mockResolvedValue({ data: null, error: { status: 500 } });
    await auth.startGoogleAuth('link', 'link-guest');
    expect(sessionStorage.getItem('pf-google-flow')).toBeNull();
  });

  it('확인 뒤 로그인은 sign-in/social로 보낸다', async () => {
    const auth = await load();
    client.$fetch.mockResolvedValue({ data: { url: 'https://accounts.google.test/auth' }, error: null });
    await auth.startGoogleAuth('sign-in', 'sign-in');
    expect(client.$fetch.mock.calls[0][0]).toBe('/sign-in/social');
    expect(client.$fetch.mock.calls[0][1].body.callbackURL).toBe('https://game.test/?google=sign-in');
  });

  it('서버가 오류를 돌려주면 이동하지 않고 실패로 알린다', async () => {
    const auth = await load();
    client.$fetch.mockResolvedValue({ data: null, error: { status: 401, message: 'Unauthorized' } });
    const r = await auth.startGoogleAuth('link', 'link-guest');
    expect(r.ok).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it('주소 없는 응답도 이동하지 않고 실패로 알린다', async () => {
    const auth = await load();
    client.$fetch.mockResolvedValue({ data: {}, error: null });
    expect((await auth.startGoogleAuth('link', 'link-guest')).ok).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('복귀 주소 읽기', () => {
  let replace: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { replace = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {}); });
  afterEach(() => replace.mockRestore());

  it('이 기기에서 시작한 흐름이면 두 질의를 지운 주소로 바꾸고 복귀 정보를 돌려준다', async () => {
    const auth = await load();
    sessionStorage.setItem('pf-google-flow', 'link-guest');
    setLocation('?google=link-guest&error=google_already_connected');
    expect(auth.takeGoogleLanding()).toEqual({ tag: 'link-guest', error: 'google_already_connected' });
    expect(replace).toHaveBeenCalledWith(window.history.state, '', '/');
  });

  it('읽으면 표지를 지워 같은 복귀를 두 번 처리하지 않는다', async () => {
    const auth = await load();
    sessionStorage.setItem('pf-google-flow', 'sign-in');
    setLocation('?google=sign-in');
    expect(auth.takeGoogleLanding()).not.toBeNull();
    setLocation('?google=sign-in');
    expect(auth.takeGoogleLanding()).toBeNull();
  });

  it('시작한 적 없는 기기(표지 없음)로 온 복귀 주소는 무시하고 질의만 지운다', async () => {
    const auth = await load();
    setLocation('?google=link-guest&error=email_account_exists');
    expect(auth.takeGoogleLanding()).toBeNull();
    expect(replace).toHaveBeenCalledWith(window.history.state, '', '/');
  });

  it('표지가 복귀 주소의 표지와 다르면 무시하고 질의만 지운다', async () => {
    const auth = await load();
    sessionStorage.setItem('pf-google-flow', 'link-guest');
    setLocation('?google=sign-in');
    expect(auth.takeGoogleLanding()).toBeNull();
    expect(replace).toHaveBeenCalledWith(window.history.state, '', '/');
  });

  it('세션 저장소를 읽지 못하면 시작한 흐름이 아닌 것으로 보고 질의만 지운다', async () => {
    const auth = await load();
    setLocation('?google=link-guest');
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(auth.takeGoogleLanding()).toBeNull();
    read.mockRestore();
    expect(replace).toHaveBeenCalledWith(window.history.state, '', '/');
  });

  it('구글 복귀 주소가 아니면 아무것도 읽지 않고 주소도 바꾸지 않는다', async () => {
    const auth = await load();
    sessionStorage.setItem('pf-google-flow', 'link-guest');
    setLocation('?token=abc');
    expect(auth.takeGoogleLanding()).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('1회용 구글 전환 티켓 확인 및 취소', () => {
  it('confirmGoogleSwitch 성공 시 흐름 표지를 남기고 복귀 주소로 이동한다', async () => {
    const auth = await load();
    client.$fetch.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await auth.confirmGoogleSwitch('sign-in')).toEqual({ ok: true });
    expect(client.$fetch).toHaveBeenCalledWith('/confirm-google-switch', { method: 'POST', body: {} });
    expect(sessionStorage.getItem('pf-google-flow')).toBe('sign-in');
    expect(assign).toHaveBeenCalledWith('https://game.test/?google=sign-in');
  });

  it('티켓 누락 또는 만료 코드는 fallback: true를 돌려주고 이동하지 않는다', async () => {
    const auth = await load();
    for (const code of ['switch_ticket_missing', 'switch_ticket_expired']) {
      client.$fetch.mockResolvedValueOnce({ data: null, error: { status: 400, code, message: 'expired' } });
      const res = await auth.confirmGoogleSwitch('sign-in');
      expect(res).toMatchObject({ ok: false, fallback: true, code });
    }
    expect(assign).not.toHaveBeenCalled();
  });

  it('429 또는 세션 불일치 등 다른 오류는 fallback: false를 돌려준다', async () => {
    const auth = await load();
    client.$fetch.mockResolvedValueOnce({ data: null, error: { status: 429, message: 'Too many requests' } });
    expect(await auth.confirmGoogleSwitch('sign-in')).toMatchObject({ ok: false, fallback: false, code: 'rate_limited' });

    client.$fetch.mockResolvedValueOnce({ data: null, error: { status: 403, code: 'switch_session_mismatch', message: 'mismatch' } });
    expect(await auth.confirmGoogleSwitch('sign-in')).toMatchObject({ ok: false, fallback: false, code: 'switch_session_mismatch' });
    expect(assign).not.toHaveBeenCalled();
  });

  it('cancelGoogleSwitch는 /cancel-google-switch를 POST 호출한다', async () => {
    const auth = await load();
    client.$fetch.mockResolvedValue({ data: { ok: true }, error: null });
    await auth.cancelGoogleSwitch();
    expect(client.$fetch).toHaveBeenCalledWith('/cancel-google-switch', { method: 'POST', body: {} });
  });
});
