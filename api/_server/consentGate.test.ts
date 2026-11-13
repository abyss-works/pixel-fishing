// 확인이 필요한 계정에게도 열어 두는 경로의 허용 목록 — 경로 등록부와 맞는지 고정한다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONSENT_EXEMPT_PATHS, isConsentExempt } from './consentGate.js';

describe('isConsentExempt', () => {
  it('경로의 마디 단위로 일치할 때만 열어 둔다', () => {
    expect(isConsentExempt('/api/account')).toBe(true);
    expect(isConsentExempt('/api/account/consents')).toBe(true);
    expect(isConsentExempt('/api/accounting')).toBe(false);
    expect(isConsentExempt('/api/accounts')).toBe(false);
    expect(isConsentExempt('/api')).toBe(false);
    expect(isConsentExempt('/api/action')).toBe(false);
  });
});

describe('경로 등록부와 허용 목록', () => {
  // 서버 진입점에 등록하는 /api 경로 문자열. 길드 경로는 길드 모듈이 등록하므로 따로 더한다.
  const main = readFileSync(join(import.meta.dirname, 'main.ts'), 'utf8');
  const guilds = readFileSync(join(import.meta.dirname, '..', 'guilds.ts'), 'utf8');
  const registered = [...new Set([...main.matchAll(/'(\/api\/[^']*)'/g), ...guilds.matchAll(/'(\/api\/[^']*)'/g)].map(m => m[1]))];

  it('열어 둔 경로는 계정, 관리자 대시보드, 예약 작업, 로그인 없는 초대 미리보기, 인증뿐이다', () => {
    expect(registered.length).toBeGreaterThan(20);
    const open = registered.filter(isConsentExempt).sort();
    expect(open).toEqual([
      '/api/account', '/api/account/consents',
      '/api/admin', '/api/admin/auth/callback/google', '/api/admin/auth/sign-in/social', '/api/admin/auth/sign-out',
      '/api/admin/live', '/api/admin/retention', '/api/admin/sessions', '/api/admin/stats/daily',
      '/api/auth/*splat',
      '/api/cron/archive', '/api/cron/purge-anon',
      '/api/guild-invites/:code',
    ]);
  });

  it('게임 요청 경로는 모두 거부 대상이다', () => {
    for (const path of ['/api/action', '/api/me', '/api/me/position', '/api/mail', '/api/friends', '/api/friends/:uid', '/api/players',
      '/api/players/:uid', '/api/rank', '/api/blocks', '/api/blocks/:uid', '/api/chat/messages/:id/reports', '/api/away-report',
      '/api/guilds', '/api/guild-memberships']) {
      expect(registered, path).toContain(path);
      expect(isConsentExempt(path), path).toBe(false);
    }
  });

  it('허용 목록의 항목은 모두 등록된 경로의 앞부분이다', () => {
    for (const prefix of CONSENT_EXEMPT_PATHS) {
      expect(registered.some(p => p === prefix || p.startsWith(`${prefix}/`)), prefix).toBe(true);
    }
  });
});
