// 스테이징 진입 전용 관리자 OAuth 게이트 단위 테스트.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { checkStageLiveUpgrade, gateHtml, isStageGateExempt, stageGate } from './stageGate.js';

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

    expect(isStageGateExempt('GET', '/api/widget')).toBe(true);
    expect(isStageGateExempt('GET', '/api/widget/auth/start')).toBe(true);
    expect(isStageGateExempt('POST', '/api/widget/auth/exchange')).toBe(true);
    expect(isStageGateExempt('POST', '/api/widget/auth/logout')).toBe(true);
    expect(isStageGateExempt('GET', '/api/widget/summary')).toBe(true);
    expect(isStageGateExempt('GET', '/api/widget/stream')).toBe(true);
    expect(isStageGateExempt('GET', '/api/widgets')).toBe(false);

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
      ['GET', '/api/widget/auth/start'],
      ['POST', '/api/widget/auth/exchange'],
      ['GET', '/api/widget/summary'],
      ['GET', '/api/widget/stream'],
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
      expect(html).toContain('callbackURL: cleanUrl');
      expect(html).toContain('errorCallbackURL: cleanUrl');
      expect(html).toContain('disableRedirect: true');
    }

    const mw403 = stageGate({ checkAdmin: async () => ({ ok: false, status: 403 }) });
    const { res: res403, out: out403 } = createRes();
    mw403(createReq('GET', '/'), res403, vi.fn());
    await vi.waitFor(() => expect(out403().status).toBe(403));
    expect(out403().contentType).toBe('html');
    expect(String(out403().body)).toContain('/api/admin/auth/sign-in/social');
    expect(String(out403().body)).toContain('/api/admin/auth/sign-out');
  });
});

describe('gateHtml 정본 디자인·문안 기계 가드', () => {
  it('401·403 HTML은 금지 문자(·, —, –)와 합쇼체(습니다, 입니다)를 포함하지 않는다', () => {
    for (const status of [401, 403] as const) {
      const html = gateHtml(status);
      expect(html).not.toMatch(/[·—–]/);
      expect(html).not.toMatch(/(?:습니다|입니다)/);
    }
  });

  it('파란 기본 버튼과 둥근 카드 모서리를 쓰지 않고 정본 팔레트·노치·베벨·keep-all·파비콘 3종을 사용한다', () => {
    for (const status of [401, 403] as const) {
      const html = gateHtml(status);
      expect(html).not.toContain('#3b82f6');
      expect(html).not.toContain('#2563eb');
      expect(html).not.toMatch(/border-radius:\s*(?:12px|8px)/);
      const radiusMatches = [...html.matchAll(/border-radius:\s*([^;]+);/g)].map(m => m[1].trim());
      for (const value of radiusMatches) {
        expect(['0', '4px']).toContain(value);
      }

      for (const token of ['#0a1526', '#14243d', '#2b4568', '#ffd54f', '#f2f7fb', '#93a8c4', '#ff8a80']) {
        expect(html).toContain(token);
      }
      expect(html).toContain('clip-path');
      expect(html).toContain('word-break: keep-all');
      expect(html).toContain('inset 1px 1px 0 rgba(255, 255, 255, 0.08)');
      expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
      expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="any" />');
      expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    }
  });

  it('공식 Google 4색 G 로고와 버튼 라벨·스타일을 포함한다', () => {
    for (const status of [401, 403] as const) {
      const html = gateHtml(status);
      for (const color of ['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#747775', '#1F1F1F']) {
        expect(html).toContain(color);
      }
      expect(html).toContain('Google로 계속하기');
      expect(html).toContain('height: 40px');
      expect(html).toContain('border-radius: 4px');
    }
  });

  it('401·403별 확정 문안과 403 로그아웃 버튼, errorCallbackURL·429·access_denied 분기를 포함한다', () => {
    const html401 = gateHtml(401);
    expect(html401).toContain('관리자 인증');
    expect(html401).toContain('스테이징 관리자 인증');
    expect(html401).toContain('프리뷰 환경은 관리자 구글 계정으로 로그인해야 이용할 수 있어요.');
    expect(html401).not.toContain('id="stage-logout"');

    const html403 = gateHtml(403);
    expect(html403).toContain('접근 제한');
    expect(html403).toContain('스테이징 접근 제한');
    expect(html403).toContain('로그인한 계정이 관리자 명부에 없어 이용할 수 없어요.');
    expect(html403).toContain('id="stage-logout"');
    expect(html403).toContain('로그아웃');
    expect(html403).toContain('/api/admin/auth/sign-out');
    expect(html403).toContain('window.location.reload()');
    expect(html403).toContain('errorCallbackURL');
    expect(html403).toContain('429');
    expect(html403).toContain('access_denied');
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
