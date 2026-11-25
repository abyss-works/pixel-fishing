// 스테이징 진입 전용 관리자 OAuth 게이트 단위 테스트.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { checkStageLiveUpgrade, isStageGateExempt, stageGate } from './stageGate.js';

function createRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: unknown;
  let contentType = '';
  const res = {
    setHeader(k: string, v: string) { headers[k.toLowerCase()] = v; return res; },
    status(code: number) { statusCode = code; return res; },
    type(t: string) { contentType = t; return res; },
    json(b: unknown) { body = b; return res; },
    send(b: unknown) { body = b; return res; },
  };
  return {
    res: res as unknown as Response,
    out: () => ({ status: statusCode, body, headers, contentType }),
  };
}

function createReq(method: string, path: string, cookie?: string): Request {
  return {
    method,
    baseUrl: '',
    path,
    headers: cookie ? { cookie } : {},
  } as unknown as Request;
}

afterEach(() => {
  delete process.env.DEPLOY_ENV;
});

describe('isStageGateExempt', () => {
  it('쿠버네티스 readinessProbe(GET /api/action), 관리자 경로, 정적 에셋·아이콘만 예외로 둔다', () => {
    expect(isStageGateExempt('GET', '/api/action')).toBe(true);
    expect(isStageGateExempt('HEAD', '/api/action')).toBe(true);
    expect(isStageGateExempt('POST', '/api/action')).toBe(false);

    expect(isStageGateExempt('POST', '/api/admin/auth/sign-in/social')).toBe(true);
    expect(isStageGateExempt('GET', '/api/admin/auth/callback/google')).toBe(true);
    expect(isStageGateExempt('POST', '/api/admin/auth/sign-out')).toBe(true);
    expect(isStageGateExempt('GET', '/api/admin')).toBe(true);
    expect(isStageGateExempt('GET', '/api/admin/live')).toBe(true);

    expect(isStageGateExempt('GET', '/admin')).toBe(true);
    expect(isStageGateExempt('GET', '/admin/')).toBe(true);
    expect(isStageGateExempt('GET', '/admin/index.html')).toBe(true);
    expect(isStageGateExempt('GET', '/admin/assets/app.js')).toBe(true);
    expect(isStageGateExempt('GET', '/admin.html')).toBe(true);

    expect(isStageGateExempt('GET', '/assets/index-abc.js')).toBe(true);
    expect(isStageGateExempt('GET', '/favicon.ico')).toBe(true);
    expect(isStageGateExempt('GET', '/favicon.svg')).toBe(true);
    expect(isStageGateExempt('GET', '/apple-touch-icon.png')).toBe(true);
  });

  it('게임 API, 인증 경로, 게임 페이지는 예외가 아니다', () => {
    for (const [method, path] of [
      ['POST', '/api/action'],
      ['GET', '/api/me'],
      ['POST', '/api/auth/sign-in/anonymous'],
      ['GET', '/api/auth/get-session'],
      ['POST', '/api/dev/promote-test'],
      ['POST', '/api/dev/reset-account'],
      ['GET', '/'],
      ['GET', '/index.html'],
      ['GET', '/g/ABC123'],
      ['GET', '/about'],
      ['GET', '/terms'],
      ['GET', '/og.png'],
    ] as const) {
      expect(isStageGateExempt(method, path), `${method} ${path}`).toBe(false);
    }
  });
});

describe('stageGate 미들웨어', () => {
  it('DEPLOY_ENV가 preview가 아니면(local, production, 미설정) 관리자 확인 없이 모두 통과시킨다', async () => {
    const checkAdmin = vi.fn();
    const mw = stageGate({ checkAdmin });

    for (const env of ['local', 'production', undefined, '', 'development']) {
      if (env === undefined) delete process.env.DEPLOY_ENV;
      else process.env.DEPLOY_ENV = env;

      const next = vi.fn();
      const { res } = createRes();
      await new Promise<void>(resolve => {
        mw(createReq('GET', '/'), res, () => { next(); resolve(); });
      });
      expect(next).toHaveBeenCalledTimes(1);
    }
    expect(checkAdmin).not.toHaveBeenCalled();
  });

  it('preview에서 예외 경로는 관리자 확인 없이 통과시킨다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    const checkAdmin = vi.fn();
    const mw = stageGate({ checkAdmin });

    for (const [method, path] of [
      ['GET', '/api/action'],
      ['POST', '/api/admin/auth/sign-in/social'],
      ['GET', '/api/admin'],
      ['GET', '/admin/'],
      ['GET', '/assets/main.js'],
      ['GET', '/favicon.ico'],
      ['GET', '/apple-touch-icon.png'],
    ] as const) {
      const next = vi.fn();
      const { res } = createRes();
      await new Promise<void>(resolve => {
        mw(createReq(method, path), res, () => { next(); resolve(); });
      });
      expect(next).toHaveBeenCalledTimes(1);
    }
    expect(checkAdmin).not.toHaveBeenCalled();
  });

  it('preview에서 API 요청은 미인증 401, 비관리자 403으로 차단하고 관리자만 통과시킨다', async () => {
    process.env.DEPLOY_ENV = 'preview';

    const mw401 = stageGate({ checkAdmin: async () => ({ ok: false, status: 401 }) });
    const out401 = createRes();
    const next401 = vi.fn();
    mw401(createReq('GET', '/api/me'), out401.res, next401);
    await vi.waitFor(() => expect(out401.out().status).toBe(401));
    expect(out401.out().body).toEqual({ error: 'unauthorized' });
    expect(next401).not.toHaveBeenCalled();

    const mw403 = stageGate({ checkAdmin: async () => ({ ok: false, status: 403 }) });
    const out403 = createRes();
    const next403 = vi.fn();
    mw403(createReq('POST', '/api/action'), out403.res, next403);
    await vi.waitFor(() => expect(out403.out().status).toBe(403));
    expect(out403.out().body).toEqual({ error: 'forbidden' });
    expect(next403).not.toHaveBeenCalled();

    const mwOk = stageGate({ checkAdmin: async () => ({ ok: true, uid: 'admin-1' }) });
    const outOk = createRes();
    await new Promise<void>(resolve => {
      mwOk(createReq('POST', '/api/action'), outOk.res, () => resolve());
    });
  });

  it('preview에서 페이지 요청은 미인증 시 Google OAuth 로그인 HTML을 내려 주고, 비관리자 시 403 안내 HTML을 내려 준다', async () => {
    process.env.DEPLOY_ENV = 'preview';

    for (const path of ['/', '/index.html', '/g/INVITE1']) {
      const mw401 = stageGate({ checkAdmin: async () => ({ ok: false, status: 401 }) });
      const { res, out } = createRes();
      const next = vi.fn();
      mw401(createReq('GET', path), res, next);
      await vi.waitFor(() => expect(out().status).toBe(401));
      expect(next).not.toHaveBeenCalled();
      expect(out().contentType).toBe('html');
      expect(out().headers['cache-control']).toBe('no-store');
      const html = String(out().body);
      expect(html).toContain('/api/admin/auth/sign-in/social');
      expect(html).toContain("provider: 'google'");
      expect(html).toContain('callbackURL: window.location.href');
      expect(html).toContain('disableRedirect: true');
    }

    const mw403 = stageGate({ checkAdmin: async () => ({ ok: false, status: 403 }) });
    const { res: res403, out: out403 } = createRes();
    mw403(createReq('GET', '/'), res403, vi.fn());
    await vi.waitFor(() => expect(out403().status).toBe(403));
    expect(out403().contentType).toBe('html');
    expect(String(out403().body)).toContain('/api/admin/auth/sign-in/social');
  });
});

describe('checkStageLiveUpgrade', () => {
  it('preview가 아니면 확인 없이 null을 반환한다', async () => {
    const checkAdmin = vi.fn();
    for (const env of ['local', 'production', undefined]) {
      if (env === undefined) delete process.env.DEPLOY_ENV;
      else process.env.DEPLOY_ENV = env;
      expect(await checkStageLiveUpgrade(createReq('GET', '/api/live'), checkAdmin)).toBeNull();
    }
    expect(checkAdmin).not.toHaveBeenCalled();
  });

  it('preview에서는 미인증 401, 비관리자 403, 관리자 null을 반환한다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    expect(await checkStageLiveUpgrade(createReq('GET', '/api/live'), async () => ({ ok: false, status: 401 }))).toBe(401);
    expect(await checkStageLiveUpgrade(createReq('GET', '/api/live'), async () => ({ ok: false, status: 403 }))).toBe(403);
    expect(await checkStageLiveUpgrade(createReq('GET', '/api/live'), async () => ({ ok: true, uid: 'admin-1' }))).toBeNull();
  });
});
