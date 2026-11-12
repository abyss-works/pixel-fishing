// 인증 인스턴스의 필수 환경 변수 검사 — 하나라도 없으면 기본값 없이 실패한다.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const REQUIRED = ['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'RESEND_API_KEY', 'MAIL_FROM', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const;
const saved: Record<string, string | undefined> = {};

// 인증 라이브러리를 처음 불러오는 비용(수 초)을 테스트 시간 밖에서 치른다. 이후 테스트의 동적 import는 변환된 모듈과 외부 패키지가 캐시에 있어 짧다
beforeAll(async () => {
  await import('./session.js');
});

beforeEach(() => {
  vi.resetModules();
  for (const k of REQUIRED) {
    saved[k] = process.env[k];
    process.env[k] = `value-of-${k}`;
  }
});
afterEach(() => {
  for (const k of REQUIRED) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('adminAuth', () => {
  for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const) {
    it(`${name}이 없으면 server-config로 실패한다`, async () => {
      delete process.env[name];
      const { adminAuth } = await import('./session.js');
      expect(() => adminAuth()).toThrowError(expect.objectContaining({ status: 500, code: 'server-config' }));
    });
  }
});

describe('appAuth', () => {
  for (const name of REQUIRED) {
    it(`${name}이 없으면 server-config로 실패한다`, async () => {
      delete process.env[name];
      const { appAuth } = await import('./session.js');
      expect(() => appAuth()).toThrowError(expect.objectContaining({ status: 500, code: 'server-config' }));
    });
  }
});
