// 구글 연결과 로그인의 시작 요청, 계정 수단 조회, 재설정 링크와의 구분을 클라우드 빌드에서 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({
  $fetch: vi.fn(),
  listAccounts: vi.fn(),
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
  client.listAccounts.mockReset();
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
    await auth.startGoogleAuth('link', 'link-email');
    expect(sessionStorage.getItem('pf-google-flow')).toBe('link-email');
  });

  it('시작하지 못하면 표지를 남기지 않는다', async () => {
    const auth = await load();
    client.$fetch.mockResolvedValue({ data: null, error: { status: 500 } });
    await auth.startGoogleAuth('link', 'link-email');
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
    const r = await auth.startGoogleAuth('link', 'link-email');
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

describe('계정 수단 조회', () => {
  it('연결된 수단의 공급자 이름을 돌려준다', async () => {
    const auth = await load();
    client.listAccounts.mockResolvedValue({ data: [{ providerId: 'google' }, { providerId: 'credential' }], error: null });
    expect(await auth.accountProviders()).toEqual(['google', 'credential']);
  });

  it('조회가 실패하면 모르는 상태(null)다', async () => {
    const auth = await load();
    client.listAccounts.mockResolvedValue({ data: null, error: { status: 500 } });
    expect(await auth.accountProviders()).toBeNull();
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
    sessionStorage.setItem('pf-google-flow', 'link-email');
    setLocation('?google=sign-in');
    expect(auth.takeGoogleLanding()).toBeNull();
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

describe('재설정 착지', () => {
  let replace: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { replace = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {}); });
  afterEach(() => replace.mockRestore());

  it('토큰이 있는 주소는 새 비밀번호를 받을 차례(ready)이고 주소에서 토큰을 지운다', async () => {
    const auth = await load();
    setLocation('?token=abc');
    expect(auth.takePasswordResetLanding()).toBe('ready');
    expect(replace).toHaveBeenCalledWith(window.history.state, '', '/');
  });

  it('error 질의가 있으면 쓸 수 없는 링크(invalid)다', async () => {
    const auth = await load();
    setLocation('?error=INVALID_TOKEN');
    expect(auth.takePasswordResetLanding()).toBe('invalid');
  });

  it('재설정과 상관없는 주소는 null이다', async () => {
    const auth = await load();
    setLocation('');
    expect(auth.takePasswordResetLanding()).toBeNull();
  });

  it('구글 복귀 주소의 error는 재설정 착지가 가로채지 않는다', async () => {
    const auth = await load();
    setLocation('?google=link-guest&error=email_account_exists');
    expect(auth.takePasswordResetLanding()).toBeNull();
  });
});
