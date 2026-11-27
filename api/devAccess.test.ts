// 개발 도구 접근 판정(isListedAdmin · devToolsGranted) 단위 테스트.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isStaff: vi.fn(async () => false),
  adminSessionUid: vi.fn(async (): Promise<string | null> => null),
}));

vi.mock('./_data/admin.js', () => ({
  isStaff: mocks.isStaff,
}));
vi.mock('./_auth/session.js', () => ({
  adminSessionUid: mocks.adminSessionUid,
}));

import { debugTriggerAllowed, devToolsGranted, importVerdict, isListedAdmin } from './devAccess.js';

const db = {} as never;
const memberUser = { id: 'u-member', email: 'member@example.test' } as never;
const guestUser = { id: 'u-guest', email: null } as never;

describe('devAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isStaff.mockResolvedValue(false);
    mocks.adminSessionUid.mockResolvedValue(null);
  });

  it('preview에서 게임 세션이나 관리자 OAuth 세션이 admins(admin·maintainer) 명부에 있으면 허용한다', async () => {
    mocks.isStaff.mockResolvedValueOnce(true);
    expect(await isListedAdmin(db, memberUser, 'preview')).toBe(true);
    expect(mocks.isStaff).toHaveBeenCalledWith(db, 'u-member');

    // 게스트 게임 세션이라도 스테이징 관리자(admin/maintainer) 쿠키가 있으면 허용한다
    mocks.adminSessionUid.mockResolvedValueOnce('u-maintainer');
    mocks.isStaff.mockResolvedValueOnce(true);
    expect(await devToolsGranted(db, guestUser, 'preview', { cookie: 'pixel-fishing-admin=tok' })).toBe(true);
    expect(mocks.isStaff).toHaveBeenLastCalledWith(db, 'u-maintainer');
  });

  it('production 및 미설정 환경에서는 명부 계정(isStaff=true)이어도 devTools를 거부한다', async () => {
    mocks.isStaff.mockResolvedValue(true);
    mocks.adminSessionUid.mockResolvedValue('u-admin');
    expect(await isListedAdmin(db, memberUser, 'production', { cookie: 'pixel-fishing-admin=tok' })).toBe(false);
    expect(await devToolsGranted(db, memberUser, 'production', { cookie: 'pixel-fishing-admin=tok' })).toBe(false);
    expect(await devToolsGranted(db, memberUser, undefined, { cookie: 'pixel-fishing-admin=tok' })).toBe(false);
    expect(mocks.isStaff).not.toHaveBeenCalled();
  });

  it('local 환경에서는 명부 조회 없이 devTools를 허용한다', async () => {
    expect(await devToolsGranted(db, guestUser, 'local')).toBe(true);
    expect(mocks.isStaff).not.toHaveBeenCalled();
  });

  it('STAGE_ALLOWED_EMAILS에 포함된 일반 테스터라도 public.admins(isStaff)에 없으면 개발 도구를 모두 차단한다', async () => {
    process.env.STAGE_ALLOWED_EMAILS = 'member@example.test';
    try {
      mocks.adminSessionUid.mockResolvedValue('u-member');
      mocks.isStaff.mockResolvedValue(false);

      const admin = await isListedAdmin(db, memberUser, 'preview', { cookie: 'pixel-fishing-admin=tok' });
      expect(admin).toBe(false);
      expect(await devToolsGranted(db, memberUser, 'preview', { cookie: 'pixel-fishing-admin=tok' })).toBe(false);
      expect(importVerdict({ deployEnv: 'preview', admin })).toBe('import-owner-only');
      expect(debugTriggerAllowed({ deployEnv: 'preview', admin })).toBe(false);
    } finally {
      delete process.env.STAGE_ALLOWED_EMAILS;
    }
  });
});
