// 낡은 클라이언트 판정(staleClient) 단위 테스트 — 운영 semver 완화 비교와 비운영 BUILD_ID 대조를 검증한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '../../src/version.js';
import { staleClient } from './clientBuild.js';

function bumpVersion(ver: string, part: 'major' | 'minor' | 'patch', delta: number): string {
  const [maj, min, pat] = ver.split('.').map(Number);
  if (part === 'major') return `${maj + delta}.${min}.${pat}`;
  if (part === 'minor') return `${maj}.${min + delta}.${pat}`;
  return `${maj}.${min}.${pat + delta}`;
}

describe('staleClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('운영(DEPLOY_ENV=production)', () => {
    it('동일 버전이면 false를 반환한다', () => {
      vi.stubEnv('DEPLOY_ENV', 'production');
      expect(staleClient({ build: 'any-build', version: APP_VERSION })).toBe(false);
    });

    it('클라이언트 버전이 서버보다 낮으면 true(426)를 반환한다', () => {
      vi.stubEnv('DEPLOY_ENV', 'production');
      const [maj, min, pat] = APP_VERSION.split('.').map(Number);
      if (pat > 0) {
        expect(staleClient({ build: 'b', version: bumpVersion(APP_VERSION, 'patch', -1) })).toBe(true);
      }
      if (min > 0) {
        expect(staleClient({ build: 'b', version: bumpVersion(APP_VERSION, 'minor', -1) })).toBe(true);
      }
      if (maj > 0) {
        expect(staleClient({ build: 'b', version: bumpVersion(APP_VERSION, 'major', -1) })).toBe(true);
      }
      expect(staleClient({ build: 'b', version: '0.0.1' })).toBe(true);
    });

    it('클라이언트 버전이 서버보다 높으면(롤링 배포 중 신 클라이언트) false를 반환한다', () => {
      vi.stubEnv('DEPLOY_ENV', 'production');
      expect(staleClient({ build: 'b', version: bumpVersion(APP_VERSION, 'patch', 1) })).toBe(false);
      expect(staleClient({ build: 'b', version: bumpVersion(APP_VERSION, 'minor', 1) })).toBe(false);
      expect(staleClient({ build: 'b', version: bumpVersion(APP_VERSION, 'major', 1) })).toBe(false);
    });

    it('버전이 누락됐거나 형식이 잘못되면 true(426)를 반환한다', () => {
      vi.stubEnv('DEPLOY_ENV', 'production');
      expect(staleClient({ build: 'b', version: undefined })).toBe(true);
      expect(staleClient({ build: 'b', version: '' })).toBe(true);
      expect(staleClient({ build: 'b', version: 'invalid' })).toBe(true);
      expect(staleClient({ build: 'b', version: '0.21' })).toBe(true);
      expect(staleClient({ build: 'b', version: '0.21.0.1' })).toBe(true);
      expect(staleClient({ build: 'b', version: [APP_VERSION] })).toBe(true);
    });
  });

  describe('프리뷰/비운영(DEPLOY_ENV!==production)', () => {
    it('BUILD_ID와 build가 같으면 false, 다르면 true를 반환한다', () => {
      vi.stubEnv('DEPLOY_ENV', 'preview');
      const expectedBuild = process.env.BUILD_ID ?? 'dev';
      expect(staleClient({ build: expectedBuild, version: '0.0.1' })).toBe(false);
      expect(staleClient({ build: 'stale-build-id', version: APP_VERSION })).toBe(true);
      expect(staleClient({ build: undefined, version: APP_VERSION })).toBe(true);
    });
  });
});
