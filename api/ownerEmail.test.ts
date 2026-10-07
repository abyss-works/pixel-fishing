// 소유자 메일 출처 — 서버 env가 정본, 없으면 하드코딩 폴백 (무해 배포).
// 클라(src/sidebar/shared.ts OWNER_EMAIL)는 표시용 힌트라 수동 동기화한다.
import { describe, it, expect, afterEach } from 'vitest';
import { importOwnerEmail, OWNER_EMAIL_FALLBACK } from './action.js';

afterEach(() => { delete process.env.IMPORT_OWNER_EMAIL; });

describe('importOwnerEmail', () => {
  it('env가 없으면 폴백을 쓴다', () => {
    expect(importOwnerEmail()).toBe(OWNER_EMAIL_FALLBACK);
  });

  it('env가 있으면 env를 쓴다', () => {
    process.env.IMPORT_OWNER_EMAIL = 'Owner@Example.com';
    expect(importOwnerEmail()).toBe('Owner@Example.com');
  });
});
