// 소유자 메일 출처 — 서버 env가 정본, 없으면 하드코딩 폴백 (무해 배포).
// 클라이언트의 OWNER_EMAIL은 관리자 UI 표시용 힌트이므로 서버 설정과 수동 동기화한다.
import { describe, it, expect, afterEach } from 'vitest';
import { importOwnerEmail, isImportOwner, OWNER_EMAIL_FALLBACK } from './action.js';

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

describe('빈 값 처리', () => {
  it('env가 빈 문자열이면 폴백을 쓴다', () => {
    process.env.IMPORT_OWNER_EMAIL = '';
    expect(importOwnerEmail()).toBe(OWNER_EMAIL_FALLBACK);
  });

  it('계정 이메일이 없거나 비어 있으면 소유자가 아니다', () => {
    for (const owner of ['', OWNER_EMAIL_FALLBACK]) {
      expect(isImportOwner(null, owner)).toBe(false);
      expect(isImportOwner(undefined, owner)).toBe(false);
      expect(isImportOwner('', owner)).toBe(false);
    }
  });

  it('이메일이 소유자와 대소문자만 달라도 소유자다', () => {
    expect(isImportOwner('Owner@Example.com', 'owner@example.COM')).toBe(true);
    expect(isImportOwner('other@example.com', 'owner@example.com')).toBe(false);
  });
});
