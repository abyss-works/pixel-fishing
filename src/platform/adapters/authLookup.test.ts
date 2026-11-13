// 계정 조회 결과의 세 종류 — 확인된 계정, 확인된 게스트, 확인 실패
import { afterEach, describe, expect, it, vi } from 'vitest';

type Session = { data: { user: { id: string; email: string; isAnonymous?: boolean } } | null; error: { status: number } | null };

async function loadWith(getSession: () => Promise<Session>) {
  vi.resetModules();
  vi.stubEnv('VITE_CLOUD', '1');
  vi.doMock('better-auth/client', () => ({ createAuthClient: () => ({ getSession }) }));
  vi.doMock('better-auth/client/plugins', () => ({ anonymousClient: () => ({}) }));
  return import('./auth');
}

describe('계정 조회 (currentAccount)', () => {
  afterEach(() => {
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
});
