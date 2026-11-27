// readMe HTTP 요청 타임아웃 시그널 및 실패 종류별 클라이언트 RTT 지표 분류 단위 테스트.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../core/errors';
import * as clientMetrics from '../clientMetrics';
import { readMe } from './me';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('readMe 타임아웃 및 실패 분류', () => {
  it('요청 시 AbortSignal.timeout(10_000) 시그널을 전달하고 정상 응답 RTT를 기록한다', async () => {
    const rttSpy = vi.spyOn(clientMetrics, 'recordClientApiRtt');
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ nickname: null, devTools: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const data = await readMe<{ nickname: string | null }>('profile');
    expect(data).toEqual({ nickname: null, devTools: false });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/me?q=profile',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(rttSpy).toHaveBeenCalledTimes(1);
    expect(rttSpy).toHaveBeenCalledWith('me', expect.any(Number));
  });

  it('일반 네트워크 오류(TypeError)는 타임아웃으로 오분류하지 않고 network AppError를 던진다', async () => {
    const rttSpy = vi.spyOn(clientMetrics, 'recordClientApiRtt');
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });

    const err = await readMe('state').catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).kind).toBe('network');
    expect(rttSpy).not.toHaveBeenCalled();
  });

  it.each(['TimeoutError', 'AbortError'] as const)(
    '%s 발생 시에만 me 타임아웃 지표로 기록하고 network AppError를 던진다',
    async name => {
      const rttSpy = vi.spyOn(clientMetrics, 'recordClientApiRtt');
      vi.stubGlobal('fetch', async () => {
        throw new DOMException('aborted', name);
      });

      const err = await readMe('bounty').catch(e => e);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).kind).toBe('network');
      expect(rttSpy).toHaveBeenCalledTimes(1);
      expect(rttSpy).toHaveBeenCalledWith('me', expect.any(Number), { timeout: true });
    },
  );
});
