// HTTP 보안 헤더 미들웨어 단위·통합 테스트.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { legalPages } from './legalPages.js';
import {
  DEFAULT_PERMISSIONS_POLICY,
  HSTS_VALUE,
  appendScriptHashToCsp,
  buildContentSecurityPolicy,
  isHttpsRequest,
  securityHeaders,
} from './securityHeaders.js';
import { GATE_SCRIPT_CSP_HASH, stageGate } from './stageGate.js';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));
const PROD_ORIGIN = 'https://pixel-fishing.abyssworks.dev';

function directiveOf(csp: string, name: string): string | undefined {
  return csp.split(';').map(part => part.trim()).find(part => part === name || part.startsWith(`${name} `));
}

describe('buildContentSecurityPolicy', () => {
  it('기본 지시어를 엄격하게 구성하고 스크립트 인라인·eval을 금지한다', () => {
    const csp = buildContentSecurityPolicy({ origin: PROD_ORIGIN });
    expect(directiveOf(csp, 'default-src')).toBe("default-src 'self'");
    expect(directiveOf(csp, 'base-uri')).toBe("base-uri 'self'");
    expect(directiveOf(csp, 'object-src')).toBe("object-src 'none'");
    expect(directiveOf(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directiveOf(csp, 'frame-src')).toBe("frame-src 'none'");
    expect(directiveOf(csp, 'form-action')).toBe("form-action 'self' https://accounts.google.com");

    const scriptSrc = directiveOf(csp, 'script-src') ?? '';
    expect(scriptSrc).toBe("script-src 'self'");
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');

    expect(directiveOf(csp, 'style-src')).toBe("style-src 'self' 'unsafe-inline'");
    expect(directiveOf(csp, 'img-src')).toBe("img-src 'self' data: blob:");
    expect(directiveOf(csp, 'font-src')).toBe("font-src 'self' data:");
    expect(directiveOf(csp, 'media-src')).toBe("media-src 'self' data: blob:");
  });

  it('origin 프로토콜에 맞는 WebSocket 출처와 Sentry 수집 도메인을 connect-src에 포함한다', () => {
    const prodConnect = directiveOf(buildContentSecurityPolicy({ origin: PROD_ORIGIN }), 'connect-src') ?? '';
    expect(prodConnect).toContain("'self'");
    expect(prodConnect).toContain('wss://pixel-fishing.abyssworks.dev');
    expect(prodConnect).toContain('https://*.ingest.sentry.io');
    expect(prodConnect).toContain('https://*.ingest.us.sentry.io');
    expect(prodConnect).toContain('https://*.ingest.de.sentry.io');

    const localConnect = directiveOf(buildContentSecurityPolicy({ origin: 'http://localhost:3000' }), 'connect-src') ?? '';
    expect(localConnect).toContain('ws://localhost:3000');
    expect(localConnect).not.toContain('wss://localhost:3000');
  });

  it('커스텀 자체 호스팅 Sentry DSN이 주어지면 키를 뺀 오리진만 connect-src에 추가하고 표준 Sentry DSN은 중복하지 않는다', () => {
    const customCsp = buildContentSecurityPolicy({
      origin: PROD_ORIGIN,
      sentryDsn: 'https://publickey@sentry.internal.example/42',
    });
    const customConnect = directiveOf(customCsp, 'connect-src') ?? '';
    expect(customConnect).toContain('https://sentry.internal.example');
    expect(customConnect).not.toContain('publickey');

    const cloudCsp = buildContentSecurityPolicy({
      origin: PROD_ORIGIN,
      sentryDsn: 'https://publickey@o12345.ingest.us.sentry.io/42',
    });
    expect(directiveOf(cloudCsp, 'connect-src')).not.toContain('o12345');
  });

  it('appendScriptHashToCsp는 기존 script-src 지시어에만 해시를 덧붙이고 중복하지 않는다', () => {
    const base = buildContentSecurityPolicy({ origin: PROD_ORIGIN });
    const hash = "'sha256-testHashValue='";
    const once = appendScriptHashToCsp(base, hash);
    expect(directiveOf(once, 'script-src')).toBe(`script-src 'self' ${hash}`);
    expect(appendScriptHashToCsp(once, hash)).toBe(once);
  });
});

describe('isHttpsRequest', () => {
  it('x-forwarded-proto 첫 값이 https이거나 TLS 소켓이면 참이고 일반 HTTP는 거짓이다', () => {
    expect(isHttpsRequest({ headers: { 'x-forwarded-proto': 'https' }, socket: {} } as never)).toBe(true);
    expect(isHttpsRequest({ headers: { 'x-forwarded-proto': 'HTTPS, http' }, socket: {} } as never)).toBe(true);
    expect(isHttpsRequest({ headers: {}, socket: { encrypted: true } } as never)).toBe(true);
    expect(isHttpsRequest({ headers: { 'x-forwarded-proto': 'http' }, socket: {} } as never)).toBe(false);
    expect(isHttpsRequest({ headers: {}, socket: {} } as never)).toBe(false);
  });
});

describe('securityHeaders Express 통합', () => {
  let server: Server;
  let base: string;
  const savedConsentDate = process.env.CONSENT_EFFECTIVE_DATE;
  const savedDeployEnv = process.env.DEPLOY_ENV;

  beforeAll(async () => {
    process.env.CONSENT_EFFECTIVE_DATE = '2099-12-31';
    delete process.env.DEPLOY_ENV;
    const app = express();
    app.disable('x-powered-by');
    app.use(securityHeaders({ origin: PROD_ORIGIN }));
    app.use(stageGate({ checkAdmin: async () => ({ ok: false, status: 401 }) }));
    app.get('/api/ping', (_req, res) => { res.json({ ok: true }); });
    app.get('/', (_req, res) => { res.type('html').send('<!doctype html><html><body>ok</body></html>'); });
    app.use(legalPages());
    app.use(express.static(publicDir));
    app.use((_req, res) => { res.status(404).json({ error: 'not-found' }); });

    server = app.listen(0);
    await new Promise<void>(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    if (savedDeployEnv === undefined) delete process.env.DEPLOY_ENV;
    else process.env.DEPLOY_ENV = savedDeployEnv;
  });

  afterAll(async () => {
    if (savedConsentDate === undefined) delete process.env.CONSENT_EFFECTIVE_DATE;
    else process.env.CONSENT_EFFECTIVE_DATE = savedConsentDate;
    await new Promise<void>(resolve => { server.close(() => resolve()); });
  });

  it.each([
    ['API JSON 응답', '/api/ping', 200],
    ['SPA HTML 진입 응답', '/', 200],
    ['공개 법무 문서 HTML', '/terms', 200],
    ['정적 에셋', '/legal.css', 200],
    ['없는 경로 404', '/does-not-exist', 404],
  ])('%s에 기본 보안 헤더 5종을 모두 설정하고 HTTP 로컬에는 HSTS를 보내지 않는다', async (_label, path, status) => {
    const res = await fetch(base + path);
    expect(res.status).toBe(status);
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('permissions-policy')).toBe(DEFAULT_PERMISSIONS_POLICY);
    expect(res.headers.has('strict-transport-security')).toBe(false);
    expect(res.headers.has('x-powered-by')).toBe(false);
  });

  it('HTTPS 프록시 요청(x-forwarded-proto: https)에는 Strict-Transport-Security를 함께 설정한다', async () => {
    const res = await fetch(`${base}/api/ping`, { headers: { 'x-forwarded-proto': 'https' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('strict-transport-security')).toBe(HSTS_VALUE);
  });

  it('스테이징 진입 게이트 401·403 HTML 응답은 보안 헤더 5종과 인라인 스크립트 SHA-256 해시 CSP를 포함한다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    for (const status of [401, 403] as const) {
      const gateApp = express();
      gateApp.use(securityHeaders({ origin: PROD_ORIGIN }));
      gateApp.use(stageGate({ checkAdmin: async () => ({ ok: false, status }) }));
      const gateServer = gateApp.listen(0);
      await new Promise<void>(resolve => gateServer.once('listening', resolve));
      try {
        const gateBase = `http://127.0.0.1:${(gateServer.address() as AddressInfo).port}`;
        const res = await fetch(`${gateBase}/`);
        expect(res.status).toBe(status);
        const html = await res.text();
        const match = /<script>([\s\S]*?)<\/script>/.exec(html);
        expect(match).not.toBeNull();
        const expectedHash = `'sha256-${createHash('sha256').update(match![1], 'utf8').digest('base64')}'`;
        expect(expectedHash).toBe(GATE_SCRIPT_CSP_HASH);

        const csp = res.headers.get('content-security-policy') ?? '';
        const scriptSrc = directiveOf(csp, 'script-src') ?? '';
        expect(scriptSrc).toContain("'self'");
        expect(scriptSrc).toContain(expectedHash);
        expect(scriptSrc).not.toContain('unsafe-inline');
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        expect(res.headers.get('x-frame-options')).toBe('DENY');
        expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
        expect(res.headers.get('permissions-policy')).toBe(DEFAULT_PERMISSIONS_POLICY);
      } finally {
        await new Promise<void>(resolve => { gateServer.close(() => resolve()); });
      }
    }
  });
});

describe('서버 진입점 보안 헤더 등록 순서', () => {
  const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

  it('securityHeaders 미들웨어를 stageGate와 인증 경로보다 앞에 전역 등록한다', () => {
    const secIdx = main.indexOf('app.use(securityHeaders(');
    const gateIdx = main.indexOf('app.use(stageGate())');
    const authIdx = main.indexOf("app.all('/api/auth/*splat'");
    expect(secIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(secIdx);
    expect(authIdx).toBeGreaterThan(secIdx);
  });
});
