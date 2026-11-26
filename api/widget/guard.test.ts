// 데스크톱 위젯 가드·클라이언트 버전 검증·인증 HTML CSP 해시 단위 테스트.
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WIDGET_MIN_CLIENT_VERSION } from '../../src/game/rules/widget.js';
import {
  WIDGET_AUTH_APP_SCRIPT_HASH,
  WIDGET_AUTH_PREVIEW_SCRIPT_HASH,
  isValidLoopbackRedirectUri,
  widgetAuthLoginHtml,
} from './auth.js';
import {
  disconnectWidgetUser,
  isWidgetApiDisabled,
  parseBearerToken,
  provideWidgetDisconnect,
  rejectIfWidgetApiDisabled,
  validateWidgetClientVersion,
} from './guard.js';

function mockRes() {
  let statusCode = 200;
  let body: unknown;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(b: unknown) { body = b; },
  };
  return { res: res as never, out: () => ({ status: statusCode, body }) };
}

afterEach(() => {
  delete process.env.DEPLOY_ENV;
  delete process.env.WIDGET_API_ENABLED;
  provideWidgetDisconnect(() => {});
});

describe('isWidgetApiDisabled / rejectIfWidgetApiDisabled', () => {
  it('production에서 WIDGET_API_ENABLED가 true가 아니면 비활성화하고 404를 응답한다', () => {
    process.env.DEPLOY_ENV = 'production';
    expect(isWidgetApiDisabled()).toBe(true);
    const first = mockRes();
    expect(rejectIfWidgetApiDisabled(first.res)).toBe(true);
    expect(first.out()).toEqual({ status: 404, body: { error: 'not-found' } });

    process.env.WIDGET_API_ENABLED = 'false';
    expect(isWidgetApiDisabled()).toBe(true);

    process.env.WIDGET_API_ENABLED = 'true';
    expect(isWidgetApiDisabled()).toBe(false);
    const allowed = mockRes();
    expect(rejectIfWidgetApiDisabled(allowed.res)).toBe(false);
    expect(allowed.out().status).toBe(200);
  });

  it('preview·local·미설정 환경에서는 기본적으로 활성화된다', () => {
    for (const env of ['preview', 'local', undefined]) {
      if (env === undefined) delete process.env.DEPLOY_ENV;
      else process.env.DEPLOY_ENV = env;
      expect(isWidgetApiDisabled()).toBe(false);
    }
  });
});

describe('validateWidgetClientVersion', () => {
  it('x-widget-client=desktop과 최소 semver 이상 버전을 통과시킨다', () => {
    expect(validateWidgetClientVersion({
      'x-widget-client': 'desktop',
      'x-widget-version': WIDGET_MIN_CLIENT_VERSION,
    })).toEqual({ ok: true, version: WIDGET_MIN_CLIENT_VERSION });

    expect(validateWidgetClientVersion({
      'x-widget-client': 'desktop',
      'x-widget-version': '1.2.0',
    })).toEqual({ ok: true, version: '1.2.0' });
  });

  it('헤더 누락·잘못된 클라이언트·미달 버전은 최소 버전과 함께 거부한다', () => {
    for (const headers of [
      {},
      { 'x-widget-client': 'web', 'x-widget-version': '1.0.0' },
      { 'x-widget-client': 'desktop', 'x-widget-version': '0.0.9' },
      { 'x-widget-client': 'desktop', 'x-widget-version': '0.1.0-rc.1' },
      { 'x-widget-client': 'desktop', 'x-widget-version': 'invalid' },
    ]) {
      expect(validateWidgetClientVersion(headers)).toEqual({
        ok: false,
        minVersion: WIDGET_MIN_CLIENT_VERSION,
      });
    }
  });
});

describe('parseBearerToken', () => {
  it('Authorization Bearer 헤더에서 토큰을 추출한다', () => {
    expect(parseBearerToken({ authorization: 'Bearer abc-123' })).toBe('abc-123');
    expect(parseBearerToken({ authorization: 'bearer  tok_xyz' })).toBe('tok_xyz');
    expect(parseBearerToken({ authorization: 'Basic abc' })).toBeNull();
    expect(parseBearerToken({ authorization: 'Bearer ' })).toBeNull();
    expect(parseBearerToken({})).toBeNull();
  });
});

describe('isValidLoopbackRedirectUri', () => {
  it('127.0.0.1의 유효 포트 /callback만 허용한다', () => {
    expect(isValidLoopbackRedirectUri('http://127.0.0.1:4100/callback')).toBe(true);
    expect(isValidLoopbackRedirectUri('http://127.0.0.1:1/callback')).toBe(true);
    expect(isValidLoopbackRedirectUri('http://127.0.0.1:65535/callback')).toBe(true);

    for (const bad of [
      undefined,
      '',
      'http://localhost:4100/callback',
      'https://127.0.0.1:4100/callback',
      'http://127.0.0.1:0/callback',
      'http://127.0.0.1:65536/callback',
      'http://127.0.0.1:4100/other',
      'http://127.0.0.1:4100/callback?x=1',
      'http://evil.example/callback',
    ]) {
      expect(isValidLoopbackRedirectUri(bad), String(bad)).toBe(false);
    }
  });
});

describe('widgetAuthLoginHtml', () => {
  it('환경별 로그인 엔드포인트와 일치하는 CSP 스크립트 해시를 생성한다', () => {
    for (const [isPreview, expectedEndpoint, expectedHash] of [
      [false, '/api/auth/sign-in/social', WIDGET_AUTH_APP_SCRIPT_HASH],
      [true, '/api/admin/auth/sign-in/social', WIDGET_AUTH_PREVIEW_SCRIPT_HASH],
    ] as const) {
      const { html, scriptHash } = widgetAuthLoginHtml(isPreview);
      expect(scriptHash).toBe(expectedHash);
      expect(html).toContain(expectedEndpoint);
      const m = /<script>([\s\S]*?)<\/script>/.exec(html);
      expect(m).not.toBeNull();
      const computed = `'sha256-${createHash('sha256').update(m![1], 'utf8').digest('base64')}'`;
      expect(scriptHash).toBe(computed);
    }
  });
});

describe('provideWidgetDisconnect', () => {
  it('등록된 SSE 종료 콜백을 호출한다', () => {
    const fn = vi.fn();
    provideWidgetDisconnect(fn);
    disconnectWidgetUser('user-1');
    expect(fn).toHaveBeenCalledWith('user-1');
  });
});
