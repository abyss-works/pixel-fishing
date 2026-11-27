// 브라우저 클라이언트 체감 성능·API 왕복 지연(RTT)·프레임·실시간 소켓 재연결 수집기.
// Zero-PII 원칙에 따라 이메일·닉네임·uid·쿼리스트링은 일체 수집하지 않고 비식별 수치만 60초 이상 간격으로 비콘 전송한다.
// jsdom·SSR·비클라우드 환경에서도 예외 없이 안전하게 동작한다.

const BEACON_URL = '/api/client-metrics';
const INITIAL_SETTLE_MS = 15_000;
const MIN_FLUSH_INTERVAL_MS = 60_000;
const MAX_LATENCY_MS = 120_000;
const MAX_RTT_SAMPLES = 32;
const MAX_CANVAS_FRAMES = 500_000;
const MAX_EVENT_COUNT = 10_000;
const LONG_FRAME_MS = 50;
const MAX_FRAME_MS = 2000;

interface ClientMetricPayload {
  lcpMs?: number;
  inpMs?: number;
  ttfbMs?: number;
  cls?: number;
  actionRttsMs?: number[];
  actionTimeouts?: number;
  actionConflicts409?: number;
  meRttsMs?: number[];
  meTimeouts?: number;
  canvasFrames?: number;
  canvasLongFrames?: number;
  wsReconnects?: number;
  wsAbnormalCloses?: number;
}

let activeCleanup: (() => void) | null = null;
let lastFlushedAt = 0;

let pendingLcpMs: number | null = null;
let lcpSent = false;
let pendingInpMs: number | null = null;
let pendingTtfbMs: number | null = null;
let ttfbSent = false;
let pendingCls = 0;
let clsObserverActive = false;
let clsSent = false;

let actionRttsMs: number[] = [];
let actionTimeouts = 0;
let actionConflicts409 = 0;
let meRttsMs: number[] = [];
let meTimeouts = 0;
let canvasFrames = 0;
let canvasLongFrames = 0;
let wsReconnects = 0;
let wsAbnormalCloses = 0;

function isCloudEnabled(): boolean {
  return import.meta.env.VITE_CLOUD === '1';
}

function clampMs(ms: number): number | null {
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.min(MAX_LATENCY_MS, Math.round(ms));
}

function resetBuffers(): void {
  pendingLcpMs = null;
  lcpSent = false;
  pendingInpMs = null;
  pendingTtfbMs = null;
  ttfbSent = false;
  pendingCls = 0;
  clsObserverActive = false;
  clsSent = false;
  actionRttsMs = [];
  actionTimeouts = 0;
  actionConflicts409 = 0;
  meRttsMs = [];
  meTimeouts = 0;
  canvasFrames = 0;
  canvasLongFrames = 0;
  wsReconnects = 0;
  wsAbnormalCloses = 0;
}

/** 단위 테스트 전용: 수집기 리스너·타이머·누적 버퍼를 초기화한다 */
export function resetClientMetricsForTest(): void {
  activeCleanup?.();
  activeCleanup = null;
  lastFlushedAt = 0;
  resetBuffers();
}

/**
 * `/api/action` 또는 `/api/me` 왕복 지연(ms)과 타임아웃·409 경합을 기록한다.
 */
export function recordClientApiRtt(
  kind: 'action' | 'me',
  durationMs: number,
  opts?: { timeout?: boolean; conflict409?: boolean },
): void {
  if (kind === 'action') {
    if (opts?.conflict409 && actionConflicts409 < MAX_EVENT_COUNT) actionConflicts409 += 1;
    if (opts?.timeout) {
      if (actionTimeouts < MAX_EVENT_COUNT) actionTimeouts += 1;
      return;
    }
    const clamped = clampMs(durationMs);
    if (clamped !== null && actionRttsMs.length < MAX_RTT_SAMPLES) {
      actionRttsMs.push(clamped);
    }
    return;
  }

  if (opts?.timeout) {
    if (meTimeouts < MAX_EVENT_COUNT) meTimeouts += 1;
    return;
  }
  const clamped = clampMs(durationMs);
  if (clamped !== null && meRttsMs.length < MAX_RTT_SAMPLES) {
    meRttsMs.push(clamped);
  }
}

/**
 * 캔버스 애니메이션 한 프레임의 소요 시간(ms)을 기록한다.
 * 탭 백그라운드 복귀 스파이크를 걸러내기 위해 0 초과 2000ms 미만만 집계한다.
 */
export function recordCanvasFrame(durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs >= MAX_FRAME_MS) return;
  if (canvasFrames < MAX_CANVAS_FRAMES) canvasFrames += 1;
  if (durationMs >= LONG_FRAME_MS && canvasLongFrames < MAX_CANVAS_FRAMES) {
    canvasLongFrames += 1;
  }
}

/**
 * 실시간 채널의 재연결 성공 또는 비정상 종료를 기록한다.
 */
export function recordLiveClose(kind: 'reconnect' | 'abnormal'): void {
  if (kind === 'reconnect') {
    if (wsReconnects < MAX_EVENT_COUNT) wsReconnects += 1;
  } else if (wsAbnormalCloses < MAX_EVENT_COUNT) {
    wsAbnormalCloses += 1;
  }
}

function takePayload(): ClientMetricPayload | null {
  const payload: ClientMetricPayload = {};

  if (!lcpSent && pendingLcpMs !== null) {
    payload.lcpMs = pendingLcpMs;
    lcpSent = true;
    pendingLcpMs = null;
  }
  if (pendingInpMs !== null) {
    payload.inpMs = pendingInpMs;
    pendingInpMs = null;
  }
  if (!ttfbSent && pendingTtfbMs !== null) {
    payload.ttfbMs = pendingTtfbMs;
    ttfbSent = true;
    pendingTtfbMs = null;
  }
  if ((!clsSent && clsObserverActive) || pendingCls > 0) {
    payload.cls = Math.round(pendingCls * 1000) / 1000;
    clsSent = true;
    pendingCls = 0;
  }

  if (actionRttsMs.length > 0) {
    payload.actionRttsMs = actionRttsMs;
    actionRttsMs = [];
  }
  if (actionTimeouts > 0) {
    payload.actionTimeouts = actionTimeouts;
    actionTimeouts = 0;
  }
  if (actionConflicts409 > 0) {
    payload.actionConflicts409 = actionConflicts409;
    actionConflicts409 = 0;
  }

  if (meRttsMs.length > 0) {
    payload.meRttsMs = meRttsMs;
    meRttsMs = [];
  }
  if (meTimeouts > 0) {
    payload.meTimeouts = meTimeouts;
    meTimeouts = 0;
  }

  if (canvasFrames > 0) {
    payload.canvasFrames = canvasFrames;
    canvasFrames = 0;
  }
  if (canvasLongFrames > 0) {
    payload.canvasLongFrames = canvasLongFrames;
    canvasLongFrames = 0;
  }

  if (wsReconnects > 0) {
    payload.wsReconnects = wsReconnects;
    wsReconnects = 0;
  }
  if (wsAbnormalCloses > 0) {
    payload.wsAbnormalCloses = wsAbnormalCloses;
    wsAbnormalCloses = 0;
  }

  return Object.keys(payload).length > 0 ? payload : null;
}

/**
 * 누적된 클라이언트 체감 지표를 비콘 또는 keepalive POST로 즉시 전송한다.
 * 최소 간격(60초) 미만이면 전송을 건너뛴다(force 지정 시 제외).
 */
export function flushClientMetricsBeacon(opts?: { force?: boolean }): boolean {
  if (!opts?.force && (typeof window === 'undefined' || typeof document === 'undefined' || !isCloudEnabled())) {
    return false;
  }
  const now = Date.now();
  if (!opts?.force && lastFlushedAt > 0 && now - lastFlushedAt < MIN_FLUSH_INTERVAL_MS) {
    return false;
  }
  const payload = takePayload();
  if (!payload) return false;
  lastFlushedAt = now;

  try {
    const json = JSON.stringify(payload);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon(BEACON_URL, new Blob([json], { type: 'application/json' }));
      if (ok) return true;
    }
    if (typeof fetch === 'function') {
      void fetch(BEACON_URL, {
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: json,
      }).catch(() => { /* 비콘 전송 실패는 플레이를 막지 않는다 */ });
      return true;
    }
  } catch {
    /* 직렬화·전송 실패는 무해하게 삼킨다 */
  }
  return false;
}

/**
 * Web Vitals(LCP·INP·TTFB·CLS) 측정과 이탈 비콘 전송을 초기화한다.
 * 중복 호출해도 리스너를 한 번만 등록하며, 정리 함수를 돌려준다.
 */
export function initClientMetrics(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !isCloudEnabled()) {
    return () => {};
  }
  if (activeCleanup) return activeCleanup;

  if (!ttfbSent && typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
    try {
      const navEntries = performance.getEntriesByType('navigation') as Array<{ responseStart?: number }>;
      const responseStart = navEntries[0]?.responseStart;
      if (typeof responseStart === 'number') {
        const clamped = clampMs(responseStart);
        if (clamped !== null) pendingTtfbMs = clamped;
      }
    } catch {
      /* 내비게이션 타이밍 미지원 시 무시한다 */
    }
  }

  const observers: PerformanceObserver[] = [];
  if (typeof PerformanceObserver === 'function') {
    const observe = (init: PerformanceObserverInit, onEntries: (entries: PerformanceEntry[]) => void): boolean => {
      try {
        const po = new PerformanceObserver(list => onEntries(list.getEntries()));
        po.observe(init);
        observers.push(po);
        return true;
      } catch {
        return false;
      }
    };

    observe({ type: 'largest-contentful-paint', buffered: true }, entries => {
      if (lcpSent || entries.length === 0) return;
      const last = entries[entries.length - 1];
      const clamped = clampMs(last.startTime);
      if (clamped !== null) pendingLcpMs = clamped;
    });

    clsObserverActive = observe({ type: 'layout-shift', buffered: true }, entries => {
      for (const entry of entries as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) {
        if (!entry.hadRecentInput && typeof entry.value === 'number' && Number.isFinite(entry.value) && entry.value > 0) {
          pendingCls += entry.value;
        }
      }
    });

    const eventOk = observe({ type: 'event', buffered: true, durationThreshold: 40 } as PerformanceObserverInit, entries => {
      for (const entry of entries as Array<PerformanceEntry & { interactionId?: number }>) {
        if ((entry.interactionId ?? 0) <= 0) continue;
        const clamped = clampMs(entry.duration);
        if (clamped !== null && (pendingInpMs === null || clamped > pendingInpMs)) {
          pendingInpMs = clamped;
        }
      }
    });
    if (!eventOk) {
      observe({ type: 'first-input', buffered: true }, entries => {
        for (const entry of entries) {
          const clamped = clampMs(entry.duration);
          if (clamped !== null && (pendingInpMs === null || clamped > pendingInpMs)) {
            pendingInpMs = clamped;
          }
        }
      });
    }
  }

  const settleTimer = setTimeout(() => {
    void flushClientMetricsBeacon();
  }, INITIAL_SETTLE_MS);
  if (typeof settleTimer === 'object' && settleTimer !== null && 'unref' in settleTimer) {
    (settleTimer as { unref: () => void }).unref();
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      void flushClientMetricsBeacon();
    }
  };
  const onPageHide = () => {
    void flushClientMetricsBeacon();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearTimeout(settleTimer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
    for (const po of observers) {
      try { po.disconnect(); } catch { /* 이미 해제된 옵저버 무시 */ }
    }
    // StrictMode 이중 마운트 등에서 buffered layout-shift 등이 재누적되지 않도록 미전송 측정 버퍼를 비운다
    pendingCls = 0;
    clsObserverActive = false;
    pendingLcpMs = null;
    pendingInpMs = null;
    pendingTtfbMs = null;
    if (activeCleanup === cleanup) activeCleanup = null;
  };
  activeCleanup = cleanup;
  return cleanup;
}
