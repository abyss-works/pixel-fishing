// 테스트용 트리거 허용 판정 — 운영 배포는 어떤 경우에도 막고, 스테이징·로컬은 소유자·로컬 오리진만 연다.
import { describe, it, expect } from 'vitest';
import { debugTablePlan, debugTriggerAllowed, importVerdict } from './action.js';
import { gameDayStartISO } from '../src/game/rules/time.js';

describe('debugTriggerAllowed', () => {
  it('운영 배포는 소유자·로컬 오리진이어도 막는다', () => {
    expect(debugTriggerAllowed({ deployEnv: 'production', localOrigin: true, owner: true })).toBe(false);
  });

  it('스테이징(preview)은 소유자 계정만 연다', () => {
    expect(debugTriggerAllowed({ deployEnv: 'preview', localOrigin: false, owner: true })).toBe(true);
    expect(debugTriggerAllowed({ deployEnv: 'preview', localOrigin: false, owner: false })).toBe(false);
  });

  it('로컬 개발은 로컬 오리진이면 연다', () => {
    expect(debugTriggerAllowed({ deployEnv: undefined, localOrigin: true, owner: false })).toBe(true);
    expect(debugTriggerAllowed({ deployEnv: 'development', localOrigin: false, owner: false })).toBe(false);
  });
});

describe('debugTablePlan', () => {
  const now = Date.parse('2026-10-16T05:00:00.000Z'); // KST 14:00

  it('흔적 만료 — 발급 시각을 전날 게임 날짜(KST 04:00 1분 전)로 옮긴다', () => {
    expect(debugTablePlan('bounty.expireTickets', now)).toEqual({
      table: 'bounty_tickets', op: 'update', values: { issued_at: '2026-10-15T18:59:00.000Z' },
    });
  });

  it('오늘 클리어 기록 초기화는 게임 날짜 시작(KST 04:00) 이후 행만 지운다', () => {
    expect(debugTablePlan('bounty.resetToday', now)).toEqual({
      table: 'bounty_clears', op: 'delete', since: { column: 'cleared_at', iso: '2026-10-15T19:00:00.000Z' },
    });
    expect(gameDayStartISO(new Date(now).toISOString())).toBe('2026-10-15T19:00:00.000Z');
  });

  it('도전권·진행 정리는 본인 행 전체를 지운다', () => {
    expect(debugTablePlan('bounty.clearTickets', now)).toEqual({ table: 'bounty_tickets', op: 'delete' });
    expect(debugTablePlan('bounty.clearProgress', now)).toEqual({ table: 'bounty_progress', op: 'delete' });
  });
});

describe('importVerdict', () => {
  it('운영은 소유자도 거부한다', () => {
    expect(importVerdict({ deployEnv: 'production', owner: true })).toBe('import-disabled');
    expect(importVerdict({ deployEnv: 'production', owner: false })).toBe('import-disabled');
  });

  it('스테이징은 소유자만 통과시킨다', () => {
    expect(importVerdict({ deployEnv: 'preview', owner: true })).toBe('ok');
    expect(importVerdict({ deployEnv: 'preview', owner: false })).toBe('import-owner-only');
  });

  it('로컬 명시 값만 모두에게 연다', () => {
    expect(importVerdict({ deployEnv: 'local', owner: false })).toBe('ok');
  });

  it('환경 값이 없거나 모르는 값이면 소유자도 거부한다', () => {
    for (const deployEnv of [undefined, '', 'development', 'Production', 'staging']) {
      expect(importVerdict({ deployEnv, owner: true })).toBe('import-disabled');
      expect(importVerdict({ deployEnv, owner: false })).toBe('import-disabled');
    }
  });
});
