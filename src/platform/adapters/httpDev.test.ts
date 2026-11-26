// HttpDev 어댑터 단위 테스트 — /api/dev/promote-test 및 /api/dev/reset-account 요청·응답·오류 매핑 검증.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../../game/rules/logic';
import { createHttpApi } from './httpApi';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

const jsonRes = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('HttpDev', () => {
  it('promoteTestAccount는 POST /api/dev/promote-test를 호출해 승격 결과를 반환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonRes({ ok: true, email: 'test-12345678@stage.invalid', isAnonymous: false }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { dev } = createHttpApi();
    await expect(dev.promoteTestAccount()).resolves.toEqual({
      ok: true,
      email: 'test-12345678@stage.invalid',
      isAnonymous: false,
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/dev/promote-test', { method: 'POST' });
  });

  it('promoteTestAccount 성공 시 1.5초 세션 캐시를 무효화해 직후 currentAccount가 승격된 계정을 읽는다', async () => {
    vi.stubEnv('VITE_CLOUD', '1');
    vi.resetModules();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonRes({ user: { id: 'g1', email: 'g1@anonymous.invalid', isAnonymous: true } }))
      .mockResolvedValueOnce(jsonRes({ ok: true, email: 'test-12345678@stage.invalid', isAnonymous: false }))
      .mockResolvedValueOnce(jsonRes({ user: { id: 'g1', email: 'test-12345678@stage.invalid', isAnonymous: false } }));
    vi.stubGlobal('fetch', fetchMock);

    const { createHttpApi: loadHttpApi } = await import('./httpApi');
    const api = loadHttpApi();
    await expect(api.auth.currentAccount()).resolves.toEqual({ status: 'guest' });
    await expect(api.dev.promoteTestAccount()).resolves.toEqual({
      ok: true,
      email: 'test-12345678@stage.invalid',
      isAnonymous: false,
    });
    await expect(api.auth.currentAccount()).resolves.toEqual({
      status: 'account',
      email: 'test-12345678@stage.invalid',
    });
  });

  it('promoteTestAccount는 HTTP 상태와 오류 코드를 일관된 실패 응답으로 매핑한다', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonRes({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(jsonRes({ error: 'forbidden' }, 403))
      .mockResolvedValueOnce(jsonRes({ error: 'not-found' }, 404))
      .mockResolvedValueOnce(jsonRes({ error: 'not-guest' }, 409))
      .mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 }))
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { dev } = createHttpApi();
    await expect(dev.promoteTestAccount()).resolves.toMatchObject({ ok: false, code: 'unauthorized' });
    await expect(dev.promoteTestAccount()).resolves.toMatchObject({ ok: false, code: 'forbidden' });
    await expect(dev.promoteTestAccount()).resolves.toMatchObject({ ok: false, code: 'not-found' });
    await expect(dev.promoteTestAccount()).resolves.toMatchObject({ ok: false, code: 'not-guest' });
    await expect(dev.promoteTestAccount()).resolves.toMatchObject({ ok: false, code: 'rate-limited' });
    await expect(dev.promoteTestAccount()).resolves.toMatchObject({ ok: false, code: 'network' });
  });

  it('resetDevAccount는 POST /api/dev/reset-account를 호출해 초기 상태와 버전을 반환한다', async () => {
    const initial = newState();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonRes({ state: initial, version: 9 }));
    vi.stubGlobal('fetch', fetchMock);

    const { dev } = createHttpApi();
    await expect(dev.resetDevAccount()).resolves.toEqual({ state: initial, version: 9 });
    expect(fetchMock).toHaveBeenCalledWith('/api/dev/reset-account', { method: 'POST' });
  });

  it('resetDevAccount는 실패 시 오류 코드와 메시지를 포함한 예외를 던진다', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonRes({ error: 'forbidden' }, 403))
      .mockResolvedValueOnce(jsonRes({ error: 'not-found' }, 404))
      .mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    const { dev } = createHttpApi();
    await expect(dev.resetDevAccount()).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    await expect(dev.resetDevAccount()).rejects.toMatchObject({ status: 404, code: 'not-found' });
    await expect(dev.resetDevAccount()).rejects.toMatchObject({ status: 429, code: 'rate-limited' });
  });
});
