// 읽기 재시도 판정 — 관리자 HTTP 오류(최상위 status)와 AppError(context.status)를 같은 모양으로 읽는 단일 위치다.
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 4_000;

interface Failure {
  status: number | null;
  unauthorized: boolean;
  retried: boolean;
  retryAfterMs: number | null;
  transient: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function read(error: unknown): Failure {
  const e = (typeof error === 'object' && error !== null ? error : {}) as Record<string, unknown>;
  const ctx = (typeof e.context === 'object' && e.context !== null ? e.context : {}) as Record<string, unknown>;
  const retryAfter = num(e.retryAfterMs) ?? num(ctx.retryAfterMs);
  const status = num(e.status) ?? num(ctx.status);
  return {
    status,
    unauthorized: status === 401 || e.kind === 'unauthorized',
    retried: e.retried === true || ctx.retried === true,
    retryAfterMs: retryAfter !== null && retryAfter >= 0 ? retryAfter : null,
    // 상태 없는 순단: AppError의 network·server, fetch가 던지는 TypeError
    transient: e.kind === 'network' || e.kind === 'server' || error instanceof TypeError,
  };
}

/** 4xx는 재시도하지 않는다. 429는 아직 재시도하지 않은 것만, 5xx와 상태 없는 순단은 제한 횟수까지 다시 시도한다 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  const f = read(error);
  if (f.status === 429) return !f.retried;
  if (f.status !== null) return f.status >= 500;
  return f.transient;
}

/** 세션 없음·만료(401) 오류인가 — 폴링이 이 오류로 무한히 돌지 않게 끊을 때 쓴다 */
export function isUnauthorizedFailure(error: unknown): boolean {
  return read(error).unauthorized;
}

/** Retry-After가 있으면 그만큼, 없으면 지수 백오프 */
export function queryRetryDelayMs(attemptIndex: number, error: unknown): number {
  return read(error).retryAfterMs ?? Math.min(BACKOFF_BASE_MS * 2 ** attemptIndex, BACKOFF_MAX_MS);
}
