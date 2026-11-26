// 익명 가입(/api/auth/sign-in/anonymous) IP 기준 생성 상한 단위·통합 테스트.
// 실제 Postgres 없이 인메모리 어댑터로 Express + 보안 헤더 + Better Auth 경로 전체를 검증한다.
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { toNodeHandler } from 'better-auth/node';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { securityHeaders } from '../_server/securityHeaders.js';

// 인증 라이브러리는 로드 시점의 NODE_ENV로 레이트리밋 활성화 기본값을 정한다.
const restoreEnv = vi.hoisted(() => {
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  return () => {
    if (before === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before;
  };
});

/** 인메모리 인증 저장소 어댑터를 Pool 타입 자리에 주입한다 */
function createInMemoryAuthPool(): Pool {
  return memoryAdapter({
    'auth.users': [],
    'auth.sessions': [],
    'auth.accounts': [],
    'auth.verifications': [],
  }) as unknown as Pool;
}

describe('익명 가입 IP 레이트리밋', () => {
  let server: Server;
  let origin: string;
  let limitMax: number;
  let limitWindow: number;

  beforeAll(async () => {
    const { ANONYMOUS_SIGN_IN_RATE_LIMIT, createAuth } = await import('./auth.js');
    limitMax = ANONYMOUS_SIGN_IN_RATE_LIMIT.max;
    limitWindow = ANONYMOUS_SIGN_IN_RATE_LIMIT.window;

    const app = express();
    app.disable('x-powered-by');
    // 서버 포트가 바인딩된 뒤 origin을 채워 인증 핸들러에 넘긴다
    let authHandler: ReturnType<typeof toNodeHandler> | null = null;
    app.use(securityHeaders());
    app.all('/api/auth/*splat', (req, res) => {
      if (!authHandler) { res.status(500).end(); return; }
      return authHandler(req, res);
    });

    server = app.listen(0);
    await new Promise<void>(resolve => server.once('listening', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const auth = createAuth({
      pool: createInMemoryAuthPool(),
      secret: 'unit-test-secret-key-for-anonymous-rate-limit',
      baseURL: origin,
      google: { clientId: 'test-client', clientSecret: 'test-secret' },
      recordLinkConsent: async () => {},
    });
    authHandler = toNodeHandler(auth);
  });

  afterAll(async () => {
    await new Promise<void>(resolve => { server?.close(() => resolve()); });
    restoreEnv();
  });

  const signInAnonymous = (forwardedFor: string) =>
    fetch(`${origin}/api/auth/sign-in/anonymous`, {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        'x-forwarded-for': forwardedFor,
      },
      body: '{}',
    });

  it('기본 상한 설정은 1시간(3600초)당 IP별 200회다', () => {
    expect(limitWindow).toBe(3600);
    expect(limitMax).toBe(200);
  });

  it('환경변수 파서는 빈 문자열·0 이하·비정수 입력 시 기본값으로 폴백하고 양의 정수는 반영한다', async () => {
    const { anonymousSignInRateLimit, parsePositiveIntEnv } = await import('./auth.js');

    expect(parsePositiveIntEnv(undefined, 200)).toBe(200);
    for (const invalid of ['', '   ', '0', '-1', '-200', '1.5', 'abc', '200ms', '1e2', 'Infinity', 'NaN', '99999999999999999999']) {
      expect(parsePositiveIntEnv(invalid, 200), `invalid=${invalid}`).toBe(200);
    }
    expect(parsePositiveIntEnv('1', 200)).toBe(1);
    expect(parsePositiveIntEnv(' 300 ', 200)).toBe(300);

    expect(anonymousSignInRateLimit({})).toEqual({ window: 3600, max: 200 });
    expect(anonymousSignInRateLimit({
      ANON_SIGN_IN_RATE_MAX: '0',
      ANON_SIGN_IN_RATE_WINDOW_SEC: 'bad',
    })).toEqual({ window: 3600, max: 200 });
    expect(anonymousSignInRateLimit({
      ANON_SIGN_IN_RATE_MAX: '45',
      ANON_SIGN_IN_RATE_WINDOW_SEC: '120',
    })).toEqual({ window: 120, max: 45 });
  });

  it('환경변수 ANON_SIGN_IN_RATE_MAX·ANON_SIGN_IN_RATE_WINDOW_SEC 재정의가 실제 레이트리밋에 적용된다', async () => {
    const prevMax = process.env.ANON_SIGN_IN_RATE_MAX;
    const prevWindow = process.env.ANON_SIGN_IN_RATE_WINDOW_SEC;
    process.env.ANON_SIGN_IN_RATE_MAX = '2';
    process.env.ANON_SIGN_IN_RATE_WINDOW_SEC = '120';
    let customServer: Server | undefined;
    try {
      const { createAuth } = await import('./auth.js');
      const app = express();
      let authHandler: ReturnType<typeof toNodeHandler> | null = null;
      app.all('/api/auth/*splat', (req, res) => {
        if (!authHandler) { res.status(500).end(); return; }
        return authHandler(req, res);
      });
      customServer = app.listen(0);
      await new Promise<void>(resolve => customServer!.once('listening', resolve));
      const customOrigin = `http://127.0.0.1:${(customServer.address() as AddressInfo).port}`;
      authHandler = toNodeHandler(createAuth({
        pool: createInMemoryAuthPool(),
        secret: 'unit-test-secret-key-for-custom-anonymous-rate-limit',
        baseURL: customOrigin,
        google: { clientId: 'test-client', clientSecret: 'test-secret' },
        recordLinkConsent: async () => {},
      }));
      const postAnon = () => fetch(`${customOrigin}/api/auth/sign-in/anonymous`, {
        method: 'POST',
        headers: { origin: customOrigin, 'content-type': 'application/json', 'x-real-ip': '198.51.100.88' },
        body: '{}',
      });

      expect((await postAnon()).status).toBe(200);
      expect((await postAnon()).status).toBe(200);
      const blocked = await postAnon();
      expect(blocked.status).toBe(429);
      const retryAfter = Number(blocked.headers.get('retry-after'));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(120);
    } finally {
      if (prevMax === undefined) delete process.env.ANON_SIGN_IN_RATE_MAX;
      else process.env.ANON_SIGN_IN_RATE_MAX = prevMax;
      if (prevWindow === undefined) delete process.env.ANON_SIGN_IN_RATE_WINDOW_SEC;
      else process.env.ANON_SIGN_IN_RATE_WINDOW_SEC = prevWindow;
      if (customServer) await new Promise<void>(resolve => customServer!.close(() => resolve()));
    }
  });

  it('같은 IP에서 상한까지는 통과하고 초과 요청은 429와 Retry-After·보안 헤더로 차단하며 다른 IP는 허용한다', async () => {
    const ipA = '198.51.100.41, 10.0.0.1';
    const ipB = '198.51.100.42, 10.0.0.1';

    for (let i = 0; i < limitMax; i++) {
      const res = await signInAnonymous(ipA);
      expect(res.status, `attempt ${i + 1}`).toBe(200);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    }

    const blocked = await signInAnonymous(ipA);
    expect(blocked.status).toBe(429);
    const retryAfter = Number(blocked.headers.get('retry-after'));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(3500);
    expect(retryAfter).toBeLessThanOrEqual(limitWindow);
    expect(blocked.headers.get('x-retry-after')).toBe(String(retryAfter));
    expect(blocked.headers.get('x-content-type-options')).toBe('nosniff');
    expect(blocked.headers.get('x-frame-options')).toBe('DENY');
    expect(blocked.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(await blocked.json()).toEqual({ message: expect.any(String) });

    // 앞쪽 X-Forwarded-For를 위조해도 신뢰 프록시 직전의 실제 클라이언트 IP 버킷에 걸려 429다
    const spoofed = await signInAnonymous('203.0.113.200, 198.51.100.41, 10.0.0.1');
    expect(spoofed.status).toBe(429);

    // 다른 클라이언트 IP는 정상 통과한다
    const other = await signInAnonymous(ipB);
    expect(other.status).toBe(200);
  });

  it('X-Forwarded-For가 없으면 X-Real-IP 헤더로 IP별 상한을 적용한다', async () => {
    const postWithRealIp = (ip: string) =>
      fetch(`${origin}/api/auth/sign-in/anonymous`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json', 'x-real-ip': ip },
        body: '{}',
      });

    for (let i = 0; i < limitMax; i++) {
      expect((await postWithRealIp('198.51.100.43')).status).toBe(200);
    }
    const blocked = await postWithRealIp('198.51.100.43');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(3500);
    expect((await postWithRealIp('198.51.100.44')).status).toBe(200);
  });
});
