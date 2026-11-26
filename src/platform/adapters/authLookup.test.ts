// 계정 조회 결과의 세 종류 — 확인된 계정, 확인된 게스트, 확인 실패
import { afterEach, describe, expect, it, vi } from 'vitest';

type Session = { data: { user: { id: string; email: string; isAnonymous?: boolean } } | null; error: { status: number } | null };

async function loadWith(
  getSession: () => Promise<Session>,
  extras: { $fetch?: ReturnType<typeof vi.fn>; signOut?: ReturnType<typeof vi.fn>; signIn?: { anonymous: ReturnType<typeof vi.fn> } } = {},
) {
  vi.resetModules();
  vi.stubEnv('VITE_CLOUD', '1');
  vi.doMock('better-auth/client', () => ({
    createAuthClient: () => ({
      getSession,
      $fetch: extras.$fetch ?? vi.fn().mockResolvedValue({ data: null, error: null }),
      signOut: extras.signOut ?? vi.fn().mockResolvedValue({ data: null, error: null }),
      signIn: extras.signIn ?? { anonymous: vi.fn().mockResolvedValue({ data: null, error: null }) },
    }),
  }));
  vi.doMock('better-auth/client/plugins', () => ({ anonymousClient: () => ({}) }));
  return import('./auth');
}

describe('계정 조회 (currentAccount)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.doUnmock('better-auth/client');
    vi.doUnmock('better-auth/client/plugins');
  });

  it('영구 계정이면 이메일과 함께 계정으로 돌려준다', async () => {
    const { currentAccount } = await loadWith(async () => ({ data: { user: { id: 'u', email: 'a@example.com', isAnonymous: false } }, error: null }));
    expect(await currentAccount()).toEqual({ status: 'account', email: 'a@example.com' });
  });

  it('세션이 없으면 게스트다', async () => {
    const { currentAccount } = await loadWith(async () => ({ data: null, error: null }));
    expect(await currentAccount()).toEqual({ status: 'guest' });
  });

  it('익명 세션은 게스트다', async () => {
    const { currentAccount } = await loadWith(async () => ({ data: { user: { id: 'u', email: 'x@temp', isAnonymous: true } }, error: null }));
    expect(await currentAccount()).toEqual({ status: 'guest' });
  });

  it('서버 오류 응답은 확인 실패다', async () => {
    const { currentAccount } = await loadWith(async () => ({ data: null, error: { status: 429 } }));
    expect(await currentAccount()).toEqual({ status: 'failed' });
  });

  it('요청이 던져지면 확인 실패다', async () => {
    const { currentAccount } = await loadWith(async () => { throw new Error('network'); });
    expect(await currentAccount()).toEqual({ status: 'failed' });
  });

  it('부팅 중 동시 호출은 getSession을 1회만 실행하고, 성공 세션은 1.5초 TTL 동안 캐시한다', async () => {
    vi.useFakeTimers();
    const getSession = vi.fn<() => Promise<Session>>()
      .mockResolvedValueOnce({ data: { user: { id: 'u1', email: 'a@example.com', isAnonymous: false } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'u1', email: 'b@example.com', isAnonymous: false } }, error: null });
    const mod = await loadWith(getSession);

    const [a, b, c] = await Promise.all([mod.ensureSession(), mod.currentAccount(), mod.sessionUid()]);
    expect(a).toBe('u1');
    expect(b).toEqual({ status: 'account', email: 'a@example.com' });
    expect(c).toBe('u1');
    expect(getSession).toHaveBeenCalledTimes(1);

    // 1.5초 이내 재호출은 캐시 사용
    vi.advanceTimersByTime(1000);
    expect(await mod.currentAccount()).toEqual({ status: 'account', email: 'a@example.com' });
    expect(getSession).toHaveBeenCalledTimes(1);

    // TTL(1.5초) 경과 후에는 다시 조회한다
    vi.advanceTimersByTime(600);
    expect(await mod.currentAccount()).toEqual({ status: 'account', email: 'b@example.com' });
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('signOut·계정 전환 함수 호출 시 세션 캐시를 즉시 비워 다음 조회가 새 세션을 읽는다', async () => {
    const getSession = vi.fn<() => Promise<Session>>()
      .mockResolvedValueOnce({ data: { user: { id: 'u1', email: 'first@example.com', isAnonymous: false } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'u2', email: 'second@example.com', isAnonymous: false } }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'u3', email: 'third@example.com', isAnonymous: false } }, error: null });
    const $fetch = vi.fn().mockResolvedValue({ data: { ok: true, url: 'https://accounts.google.test/o' }, error: null });
    const signOut = vi.fn().mockResolvedValue({ data: null, error: null });
    const mod = await loadWith(getSession, { $fetch, signOut });

    expect(await mod.currentAccount()).toEqual({ status: 'account', email: 'first@example.com' });
    expect(getSession).toHaveBeenCalledTimes(1);

    await mod.signOutAccount();
    expect(await mod.currentAccount()).toEqual({ status: 'account', email: 'second@example.com' });
    expect(getSession).toHaveBeenCalledTimes(2);

    await mod.cancelGoogleSwitch();
    expect(await mod.currentAccount()).toEqual({ status: 'guest' });
    expect(getSession).toHaveBeenCalledTimes(3);

    vi.stubGlobal('window', { location: { origin: 'https://game.test', assign: vi.fn() } });
    await mod.startGoogleAuth('link', 'tag');
    expect(await mod.currentAccount()).toEqual({ status: 'account', email: 'third@example.com' });
    expect(getSession).toHaveBeenCalledTimes(4);
  });

  it('ensureSession의 signIn.anonymous 진행 중 세션 무효화가 일어나면 완료 후 캐시를 쓰지 않는다', async () => {
    let resolveAnon!: (v: { data: { user: { id: string; email: string; isAnonymous: boolean } } | null; error: null }) => void;
    const anonPromise = new Promise<{ data: { user: { id: string; email: string; isAnonymous: boolean } } | null; error: null }>(r => {
      resolveAnon = r;
    });
    const getSession = vi.fn<() => Promise<Session>>()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'u-fresh', email: 'fresh@example.com', isAnonymous: false } }, error: null });
    const anonymous = vi.fn(() => anonPromise);
    const mod = await loadWith(getSession, { signIn: { anonymous } });

    const pending = mod.ensureSession();
    await vi.waitFor(() => expect(anonymous).toHaveBeenCalledTimes(1));
    mod.invalidateSessionCache();
    resolveAnon({ data: { user: { id: 'u-stale', email: 'stale@anonymous.invalid', isAnonymous: true } }, error: null });
    await pending;

    expect(await mod.currentAccount()).toEqual({ status: 'account', email: 'fresh@example.com' });
    expect(getSession).toHaveBeenCalledTimes(2);
  });
});
