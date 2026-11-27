// 채팅 신고·차단 어댑터 — readBlocks의 HTTP 상태/Retry-After 오류 전파와 403 consent-required/account-only 분기를 검증한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeBlock, readBlocks, reportChat } from './chat';
import { isConsentRequiredError, subscribeConsentRequired } from './requestFailure';

afterEach(() => vi.unstubAllGlobals());

describe('채팅 신고·차단 어댑터', () => {
  it('403 consent-required 응답은 약관 알림을 보내고 readBlocks는 ConsentRequiredError를 던지며 쓰기는 failed를 돌려준다', async () => {
    const onConsent = vi.fn();
    const off = subscribeConsentRequired(onConsent);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'consent-required' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    }));
    try {
      await expect(readBlocks()).rejects.toSatisfy((e: unknown) => isConsentRequiredError(e));
      await expect(changeBlock('block', 'u1')).resolves.toEqual({ error: 'failed' });
      await expect(reportChat(1)).resolves.toEqual({ error: 'failed' });
      expect(onConsent).toHaveBeenCalledTimes(3);
    } finally {
      off();
    }
  });

  it('consent-required가 아닌 403 응답은 기존처럼 guest로 돌려준다', async () => {
    const onConsent = vi.fn();
    const off = subscribeConsentRequired(onConsent);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'account-only' }), { status: 403 }));
    try {
      await expect(readBlocks()).resolves.toEqual({ error: 'guest' });
      await expect(reportChat(1)).resolves.toEqual({ error: 'guest' });
      expect(onConsent).not.toHaveBeenCalled();
    } finally {
      off();
    }
  });

  it('readBlocks는 401·429(Retry-After)·500·네트워크 실패를 AppError로 전파한다', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 401 }));
    await expect(readBlocks()).rejects.toMatchObject({ name: 'AppError', kind: 'unauthorized' });

    vi.stubGlobal('fetch', async () => new Response('Too Many Requests', {
      status: 429,
      headers: { 'retry-after': '4' },
    }));
    await expect(readBlocks()).rejects.toMatchObject({
      name: 'AppError',
      kind: 'rate-limited',
      context: { status: 429, retryAfterMs: 4000 },
    });

    vi.stubGlobal('fetch', async () => new Response(null, { status: 500 }));
    await expect(readBlocks()).rejects.toMatchObject({
      name: 'AppError',
      kind: 'network',
      context: { status: 500 },
    });

    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    await expect(readBlocks()).rejects.toMatchObject({ name: 'AppError', kind: 'network' });
  });

  it('changeBlock·reportChat의 404·네트워크 실패를 missing/failed로 돌려준다', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 404 }));
    await expect(reportChat(1)).resolves.toEqual({ error: 'missing' });

    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    await expect(changeBlock('unblock', 'u1')).resolves.toEqual({ error: 'failed' });
  });
});
