// HTTP 보안 헤더 미들웨어 — 모든 HTTP 응답(API, 서버 렌더 HTML, 정적 자산)에 기본 보안 헤더를 적용한다.
import type { RequestHandler } from 'express';
import type { IncomingMessage } from 'node:http';

export interface SecurityHeadersOptions {
  /** 서비스의 신뢰 오리진(예: https://pixel-fishing.abyssworks.dev). 설정하면 해당 호스트의 WebSocket 출처를 connect-src에 포함한다 */
  origin?: string;
  /** 오류 수집용 Sentry DSN. 자체 호스팅 도메인이면 키를 제외한 오리진만 connect-src에 추가한다 */
  sentryDsn?: string;
  /** 특정 서버 렌더 HTML 응답에 제한적으로 허용할 인라인 스크립트 해시 토큰 목록 */
  scriptHashes?: readonly string[];
}

/** 사용하지 않는 민감 브라우저 API 접근을 차단하는 Permissions-Policy 기본값 */
export const DEFAULT_PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()';

/** HTTPS 요청에 적용하는 HSTS 헤더 값(1년, 하위 도메인 포함, preload 미포함) */
export const HSTS_VALUE = 'max-age=31536000; includeSubDomains';

const SENTRY_INGEST_SOURCES = [
  'https://*.ingest.sentry.io',
  'https://*.ingest.us.sentry.io',
  'https://*.ingest.de.sentry.io',
] as const;

const STANDARD_SENTRY_SUFFIXES = [
  '.ingest.sentry.io',
  '.ingest.us.sentry.io',
  '.ingest.de.sentry.io',
] as const;

function wsOriginOf(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol === 'https:') return `wss://${url.host}`;
    if (url.protocol === 'http:') return `ws://${url.host}`;
    return null;
  } catch {
    return null;
  }
}

function customSentryOriginOf(dsn: string | undefined): string | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (STANDARD_SENTRY_SUFFIXES.some(suffix => host.endsWith(suffix))) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** 애플리케이션 응답에 적용할 Content-Security-Policy 헤더 값을 조립한다 */
export function buildContentSecurityPolicy(options: SecurityHeadersOptions = {}): string {
  const scriptSrc = ["'self'", ...(options.scriptHashes ?? [])];
  const connectSrc: string[] = ["'self'"];
  const wsOrigin = wsOriginOf(options.origin);
  if (wsOrigin) connectSrc.push(wsOrigin);
  connectSrc.push(...SENTRY_INGEST_SOURCES);
  const customSentry = customSentryOriginOf(options.sentryDsn);
  if (customSentry) connectSrc.push(customSentry);

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self' https://accounts.google.com",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    `connect-src ${connectSrc.join(' ')}`,
  ].join('; ');
}

/** 기존 Content-Security-Policy 헤더 문자열의 script-src 지시어에 해시 토큰을 중복 없이 추가한다 */
export function appendScriptHashToCsp(csp: string, hash: string): string {
  const directives = csp.split(';').map(part => part.trim()).filter(Boolean);
  let updated = false;
  const next = directives.map(directive => {
    if (directive !== 'script-src' && !directive.startsWith('script-src ')) return directive;
    updated = true;
    const tokens = directive.split(/\s+/);
    if (tokens.includes(hash)) return directive;
    return `${directive} ${hash}`;
  });
  if (!updated) next.push(`script-src 'self' ${hash}`);
  return next.join('; ');
}

/** 요청이 TLS 종단 프록시(X-Forwarded-Proto: https) 또는 직접 TLS 소켓으로 들어왔는지 판별한다 */
export function isHttpsRequest(req: IncomingMessage): boolean {
  const proto = req.headers['x-forwarded-proto'];
  const first = (Array.isArray(proto) ? proto[0] : proto)?.split(',')[0]?.trim().toLowerCase();
  if (first === 'https') return true;
  return (req.socket as { encrypted?: boolean } | undefined)?.encrypted === true;
}

/** 기본 HTTP 보안 헤더 5종과 HTTPS 한정 HSTS를 모든 응답에 설정하는 미들웨어 */
export function securityHeaders(options: SecurityHeadersOptions = {}): RequestHandler {
  const csp = buildContentSecurityPolicy(options);
  return (req, res, next) => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', DEFAULT_PERMISSIONS_POLICY);
    if (isHttpsRequest(req)) {
      res.setHeader('Strict-Transport-Security', HSTS_VALUE);
    }
    next();
  };
}
