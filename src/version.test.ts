// 버전 단일 근원 동기화 가드 — src/version.ts(클라+서버 공유 리터럴)와 package.json이
// 어긋나면 CI가 죽는다. 릴리즈 bump 시 두 곳을 함께 올릴 것.
import { describe, it, expect } from 'vitest';
import { APP_VERSION } from './version';
import pkg from '../package.json';

describe('APP_VERSION', () => {
  it('package.json version과 일치한다', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });
});
