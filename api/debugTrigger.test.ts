// 테스트용 트리거 허용 판정 — 운영 배포는 어떤 경우에도 막고, 스테이징은 명부 계정만, 로컬은 모두 연다.
import { describe, it, expect } from 'vitest';
import { debugTablePlan } from './action.js';
import { debugTriggerAllowed, importVerdict } from './devAccess.js';
import { gameDayStartISO } from '../src/game/rules/time.js';

describe('debugTriggerAllowed', () => {
  it('운영은 명부 계정도 거부한다', () => {
    expect(debugTriggerAllowed({ deployEnv: 'production', admin: true })).toBe(false);
    expect(debugTriggerAllowed({ deployEnv: 'production', admin: false })).toBe(false);
  });

  it('스테이징(preview)은 명부 계정 계정만 연다', () => {
    expect(debugTriggerAllowed({ deployEnv: 'preview', admin: true })).toBe(true);
    expect(debugTriggerAllowed({ deployEnv: 'preview', admin: false })).toBe(false);
  });

  it('로컬 명시 값은 모두에게 연다', () => {
    expect(debugTriggerAllowed({ deployEnv: 'local', admin: true })).toBe(true);
    expect(debugTriggerAllowed({ deployEnv: 'local', admin: false })).toBe(true);
  });

  it('환경 값이 없거나 모르는 값이면 명부 계정도 거부한다', () => {
    for (const deployEnv of [undefined, '', 'development', 'Production', 'staging']) {
      expect(debugTriggerAllowed({ deployEnv, admin: true })).toBe(false);
      expect(debugTriggerAllowed({ deployEnv, admin: false })).toBe(false);
    }
  });

  it('대소문자가 다르거나 앞뒤 공백이 붙은 값은 모르는 값으로 보아 거부한다', () => {
    for (const deployEnv of ['Local', 'LOCAL', ' local', 'local ', 'Preview', 'PREVIEW', ' preview', 'preview ']) {
      expect(debugTriggerAllowed({ deployEnv, admin: true })).toBe(false);
      expect(debugTriggerAllowed({ deployEnv, admin: false })).toBe(false);
    }
  });

  it('강제 조우·개발 명령·이사 코드는 같은 판정 표를 쓴다', () => {
    for (const deployEnv of [undefined, '', 'production', 'Production', 'preview', 'local', 'Local', ' local ', 'development']) {
      for (const admin of [true, false]) {
        expect(debugTriggerAllowed({ deployEnv, admin })).toBe(importVerdict({ deployEnv, admin }) === 'ok');
      }
    }
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
  it('운영은 명부 계정도 거부한다', () => {
    expect(importVerdict({ deployEnv: 'production', admin: true })).toBe('import-disabled');
    expect(importVerdict({ deployEnv: 'production', admin: false })).toBe('import-disabled');
  });

  it('스테이징은 명부 계정만 통과시킨다', () => {
    expect(importVerdict({ deployEnv: 'preview', admin: true })).toBe('ok');
    expect(importVerdict({ deployEnv: 'preview', admin: false })).toBe('import-owner-only');
  });

  it('로컬 명시 값만 모두에게 연다', () => {
    expect(importVerdict({ deployEnv: 'local', admin: false })).toBe('ok');
  });

  it('환경 값이 없거나 모르는 값이면 명부 계정도 거부한다', () => {
    for (const deployEnv of [undefined, '', 'development', 'Production', 'staging', 'Local', ' local ']) {
      expect(importVerdict({ deployEnv, admin: true })).toBe('import-disabled');
      expect(importVerdict({ deployEnv, admin: false })).toBe('import-disabled');
    }
  });
});
