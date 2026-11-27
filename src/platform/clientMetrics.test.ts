// @vitest-environment jsdom
// 브라우저 클라이언트 체감 지표 수집기(Web Vitals·RTT·프레임·WS 재연결·비콘 플러시) 단위 테스트.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushClientMetricsBeacon,
  initClientMetrics,
  recordCanvasFrame,
  recordClientApiRtt,
  recordLiveClose,
  resetClientMetricsForTest,
} from './clientMetrics';
import { readMe } from './adapters/me';

describe('clientMetrics 브라우저 수집기', () => {
  const sendBeacon = vi.fn((_url: string, _data: Blob) => true);
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));

  beforeEach(() => {
    vi.useFakeTimers();
    resetClientMetricsForTest();
    sendBeacon.mockReset().mockReturnValue(true);
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubEnv('VITE_CLOUD', '1');
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      writable: true,
      value: sendBeacon,
    });
  });

  afterEach(() => {
    resetClientMetricsForTest();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('비클라우드(!VITE_CLOUD) 환경에서는 초기화와 플러시가 무해한 no-op이다', () => {
    vi.stubEnv('VITE_CLOUD', '0');
    const stop = initClientMetrics();
    recordCanvasFrame(16);
    expect(flushClientMetricsBeacon()).toBe(false);
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    stop();
  });

  it('recordCanvasFrame은 0 초과 2000ms 미만만 집계하고 50ms 이상은 장프레임으로 센다', () => {
    recordCanvasFrame(0);
    recordCanvasFrame(-5);
    recordCanvasFrame(16.4);
    recordCanvasFrame(50);
    recordCanvasFrame(120);
    recordCanvasFrame(2000); // 백그라운드 복귀 스파이크 제외
    recordCanvasFrame(Number.NaN);

    expect(flushClientMetricsBeacon({ force: true })).toBe(true);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe('/api/client-metrics');
    expect(blob).toBeInstanceOf(Blob);
  });

  it('Web Vitals(PerformanceObserver)·RTT·프레임·WS 이벤트를 모아 15초 정착 타이머에 1회 전송하고 최소 60초 간격을 지킨다', async () => {
    const observers: Array<{ types: string[]; cb: (list: { getEntries: () => unknown[] }) => void }> = [];
    class FakePO {
      private cb: (list: { getEntries: () => unknown[] }) => void;
      constructor(cb: (list: { getEntries: () => unknown[] }) => void) {
        this.cb = cb;
      }
      observe(opts: { type?: string; entryTypes?: string[] }) {
        observers.push({ types: opts.type ? [opts.type] : (opts.entryTypes ?? []), cb: this.cb });
      }
      disconnect() {}
    }
    vi.stubGlobal('PerformanceObserver', FakePO);
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ responseStart: 185 }] as unknown as PerformanceEntryList);

    const stop1 = initClientMetrics();
    const stop2 = initClientMetrics(); // 중복 호출 안전성 확인

    for (const obs of observers) {
      if (obs.types.includes('largest-contentful-paint')) {
        obs.cb({ getEntries: () => [{ startTime: 1420 }] });
      } else if (obs.types.includes('layout-shift')) {
        obs.cb({ getEntries: () => [{ value: 0.025, hadRecentInput: false }, { value: 0.5, hadRecentInput: true }] });
      } else if (obs.types.includes('event') || obs.types.includes('first-input')) {
        obs.cb({ getEntries: () => [{ interactionId: 1, duration: 110 }, { interactionId: 0, duration: 400 }] });
      }
    }

    recordClientApiRtt('action', 120);
    recordClientApiRtt('action', 310, { conflict409: true });
    recordClientApiRtt('action', 10_000, { timeout: true });
    recordClientApiRtt('me', 90);
    recordClientApiRtt('me', 5000, { timeout: true });
    recordCanvasFrame(16);
    recordCanvasFrame(75);
    recordLiveClose('reconnect');
    recordLiveClose('abnormal');

    vi.advanceTimersByTime(15_000);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const firstBlob = sendBeacon.mock.calls[0]?.[1] as Blob;
    const payload = JSON.parse(await firstBlob.text()) as Record<string, unknown>;
    expect(payload).toEqual({
      lcpMs: 1420,
      inpMs: 110,
      ttfbMs: 185,
      cls: 0.025,
      actionRttsMs: [120, 310],
      actionTimeouts: 1,
      actionConflicts409: 1,
      meRttsMs: [90],
      meTimeouts: 1,
      canvasFrames: 2,
      canvasLongFrames: 1,
      wsReconnects: 1,
      wsAbnormalCloses: 1,
    });
    expect(JSON.stringify(payload)).not.toMatch(/email|nickname|uid/i);

    // 60초 미만에서는 visibilitychange가 재전송하지 않는다
    recordCanvasFrame(20);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sendBeacon).toHaveBeenCalledTimes(1);

    // 60초 경과 후 pagehide 시 누적분 전송
    vi.advanceTimersByTime(60_000);
    window.dispatchEvent(new Event('pagehide'));
    expect(sendBeacon).toHaveBeenCalledTimes(2);

    stop1();
    stop2();
  });

  it('sendBeacon이 없거나 false면 fetch keepalive로 폴백하고 오류를 삼킨다', () => {
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    recordCanvasFrame(20);

    expect(flushClientMetricsBeacon({ force: true })).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/client-metrics', {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ canvasFrames: 1 }),
    });
  });

  it('readMe 실행 시간과 실패·타임아웃을 /api/me RTT 지표로 기록한다', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ nickname: null, devTools: false }), { status: 200 }));
    await readMe('profile');

    fetchMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
    await expect(readMe('state')).rejects.toThrow();

    expect(flushClientMetricsBeacon({ force: true })).toBe(true);
    const blob = sendBeacon.mock.calls[0]?.[1] as Blob;
    const payload = JSON.parse(await blob.text()) as { meRttsMs?: number[]; meTimeouts?: number };
    expect(payload.meRttsMs).toHaveLength(1);
    expect(payload.meTimeouts).toBe(1);
  });

  it('SSR·window 미존재 환경과 RTT 32샘플 상한에서도 안전하게 동작한다', async () => {
    for (let i = 0; i < 40; i++) recordClientApiRtt('action', 100 + i);
    expect(flushClientMetricsBeacon({ force: true })).toBe(true);
    const blob = sendBeacon.mock.calls[0]?.[1] as Blob;
    const payload = JSON.parse(await blob.text()) as { actionRttsMs?: number[] };
    expect(payload.actionRttsMs).toHaveLength(32);

    vi.stubGlobal('window', undefined);
    const stop = initClientMetrics();
    expect(flushClientMetricsBeacon()).toBe(false);
    stop();
  });
});
