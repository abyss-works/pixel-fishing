// HTTP 보안 헤더 미들웨어 — 모든 HTTP 응답(API, 서버 렌더 HTML, 정적 자산)에 기본 보안 헤더를 적용한다.
import type { RequestHandler } from 'express';
import type { IncomingMessage } from 'node:http';
import { isTrustedProxyAddress } from '../_auth/trustedProxy.js';

export interface SecurityHeadersOptions {
  /** 서비스의 신뢰 오리진(예: https://pixel-fishing.abyssworks.dev). WebSocket 출처와 HSTS 스킴 판별에 쓴다 */
  origin?: string;
  /** 오류 수집용 Sentry DSN(단일 또는 목록). 자체 호스팅 도메인이면 키를 제외한 오리진만 connect-src에 추가한다 */
  sentryDsn?: string | readonly (string | undefined)[];
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

function originUrlOf(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

function wsOriginOf(origin: string | undefined): string | null {
  const url = originUrlOf(origin);
  if (!url) return null;
  if (url.protocol === 'https:') return `wss://${url.host}`;
  if (url.protocol === 'http:') return `ws://${url.host}`;
  return null;
}

function customSentryOriginOf(dsn: string | undefined, selfOrigin: string | null): string | null {
  const url = originUrlOf(dsn);
  if (!url || url.protocol !== 'https:') return null;
  if (selfOrigin && url.origin === selfOrigin) return null;
  const host = url.hostname.toLowerCase();
  if (STANDARD_SENTRY_SUFFIXES.some(suffix => host.endsWith(suffix))) return null;
  return url.origin;
}

/** 애플리케이션 응답에 적용할 Content-Security-Policy 헤더 값을 조립한다 */
export function buildContentSecurityPolicy(options: SecurityHeadersOptions = {}): string {
  const scriptSrc = ["'self'", ...(options.scriptHashes ?? [])];
  const connectSrc: string[] = ["'self'"];
  const selfOrigin = originUrlOf(options.origin)?.origin ?? null;
  const wsOrigin = wsOriginOf(options.origin);
  if (wsOrigin) connectSrc.push(wsOrigin);
  connectSrc.push(...SENTRY_INGEST_SOURCES);

  const dsns = Array.isArray(options.sentryDsn) ? options.sentryDsn : [options.sentryDsn];
  const extraOrigins = new Set<string>();
  for (const dsn of dsns) {
    const customSentry = customSentryOriginOf(dsn, selfOrigin);
    if (customSentry) extraOrigins.add(customSentry);
  }
  connectSrc.push(...extraOrigins);

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

/** 요청이 직접 TLS 소켓이거나, HTTPS 오리진에서 신뢰 프록시가 마지막으로 전달한 HTTPS 요청인지 판별한다 */
export function isHttpsRequest(req: IncomingMessage, options?: { origin?: string }): boolean {
  if ((req.socket as { encrypted?: boolean } | undefined)?.encrypted === true) return true;
  const configured = originUrlOf(options?.origin);
  if (configured && configured.protocol !== 'https:') return false;
  if (!isTrustedProxyAddress(req.socket?.remoteAddress)) return false;
  const proto = req.headers['x-forwarded-proto'];
  const joined = Array.isArray(proto) ? proto.join(',') : proto;
  const tokens = joined?.split(',').map(v => v.trim().toLowerCase()).filter(Boolean) ?? [];
  return tokens.at(-1) === 'https';
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
    if (isHttpsRequest(req, options)) {
      res.setHeader('Strict-Transport-Security', HSTS_VALUE);
    }
    next();
  };
}
