// 클라이언트 체감 성능 비콘 수집 엔드포인트 — POST /api/client-metrics (Node 런타임)
// 유효 세션이 있는 클라이언트가 보낸 비식별 성능 수치만 엄격히 검증해 메모리 수집기에 적재하고 204를 즉답한다.
// IP당 분당 요청 상한(20회)을 넘기면 429와 Retry-After로 차단한다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sessionOf } from './_auth/session.js';
import { parseClientMetricBeacon, recordClientMetricBeacon } from './_server/clientMetrics.js';
import { clientKey, createSharedRateLimiter } from './_server/rateLimit.js';
import { ApiError, toApiError } from './errors.js';
import { reportServerIssue } from './observability.js';

type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void; end: () => void };

const MAX_BEACON_BYTES = 16_384;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_MINUTE = 20;

let limiter = createSharedRateLimiter({ prefix: 'client-metrics', windowMs: RATE_WINDOW_MS, max: RATE_MAX_PER_MINUTE });

/** 단위 테스트용 속도 제한 상태 초기화 */
export function resetClientMetricsRateLimiterForTest(): void {
  limiter = createSharedRateLimiter({ prefix: 'client-metrics', windowMs: RATE_WINDOW_MS, max: RATE_MAX_PER_MINUTE });
}

function parseBodyObject(raw: unknown): unknown {
  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw, 'utf8') > MAX_BEACON_BYTES) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    try {
      if (Buffer.byteLength(JSON.stringify(raw), 'utf8') > MAX_BEACON_BYTES) return null;
    } catch {
      return null;
    }
    return raw;
  }
  return null;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    await route(req, res);
  } catch (e) {
    const err = toApiError(e);
    if (err.status === 429 && typeof err.context.retryAfter === 'string') {
      res.setHeader('Retry-After', err.context.retryAfter);
    }
    if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
    res.status(err.status).json({ error: err.code });
  }
}

async function route(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') throw new ApiError(405, 'method-not-allowed');

  const key = clientKey(req);
  const now = Date.now();
  const rate = await limiter.check(key, now);
  if (!rate.allowed) {
    throw new ApiError(429, 'rate-limited', { retryAfter: String(rate.retryAfterSec) });
  }

  if (!process.env.DATABASE_URL) throw new ApiError(500, 'server-config');
  const session = await sessionOf(req.headers);
  if (!session) throw new ApiError(401, 'unauthorized');

  const rawObj = parseBodyObject(req.body);
  const parsed = parseClientMetricBeacon(rawObj);
  if (!parsed) throw new ApiError(400, 'bad-metrics');

  recordClientMetricBeacon(parsed);
  res.status(204).end();
}
