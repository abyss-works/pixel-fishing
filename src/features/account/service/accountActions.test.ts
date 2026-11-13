// 게스트 판정 — 계정 확인이 끝나 게스트로 확정된 경우에만 포구에서 막는다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ isConfigured: true }));

vi.mock('../../../platform/api', () => ({
  api: { auth: { get isConfigured() { return auth.isConfigured; } } },
}));

import { isConfirmedGuest } from './accountActions';

describe('확정된 게스트 (isConfirmedGuest)', () => {
  beforeEach(() => { auth.isConfigured = true; });

  it('계정 확인이 끝났고 계정이 없으면 게스트다', () => {
    expect(isConfirmedGuest(null, true)).toBe(true);
  });

  it('계정 확인 전이거나 확인에 실패해 끝나지 않았으면 계정이 없어 보여도 게스트로 확정하지 않는다', () => {
    expect(isConfirmedGuest(null, false)).toBe(false);
  });

  it('로그인한 계정은 확인이 끝났어도 게스트가 아니다', () => {
    expect(isConfirmedGuest('a@example.com', true)).toBe(false);
  });

  it('게임 서버가 없는 로컬 모드는 게스트로 보지 않는다', () => {
    auth.isConfigured = false;
    expect(isConfirmedGuest(null, true)).toBe(false);
  });
});
