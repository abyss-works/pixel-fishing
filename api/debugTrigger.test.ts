// 테스트용 트리거 허용 판정 — 운영 배포는 어떤 경우에도 막고, 스테이징·로컬은 소유자·로컬 오리진만 연다.
import { describe, it, expect } from 'vitest';
import { debugTablePlan, debugTriggerAllowed, kstDayStartISO } from './action.js';
import { challengeWindowMs } from '../src/game/rules/challenge.js';

describe('debugTriggerAllowed', () => {
  it('운영 배포는 소유자·로컬 오리진이어도 막는다', () => {
    expect(debugTriggerAllowed({ vercelEnv: 'production', localOrigin: true, owner: true })).toBe(false);
  });

  it('스테이징(preview)은 소유자 계정만 연다', () => {
    expect(debugTriggerAllowed({ vercelEnv: 'preview', localOrigin: false, owner: true })).toBe(true);
    expect(debugTriggerAllowed({ vercelEnv: 'preview', localOrigin: false, owner: false })).toBe(false);
  });

  it('로컬 개발은 로컬 오리진이면 연다', () => {
    expect(debugTriggerAllowed({ vercelEnv: undefined, localOrigin: true, owner: false })).toBe(true);
    expect(debugTriggerAllowed({ vercelEnv: 'development', localOrigin: false, owner: false })).toBe(false);
  });
});

describe('debugTablePlan', () => {
  const now = Date.parse('2026-10-16T05:00:00.000Z'); // KST 14:00

  it('도전권 만료 직전 — 발급 시각을 유효 시간에서 1분 모자라게 당긴다', () => {
    expect(debugTablePlan('bounty.ticketNearExpiry', now)).toEqual({
      table: 'bounty_tickets', op: 'update',
      values: { issued_at: new Date(now - challengeWindowMs() + 60_000).toISOString() },
    });
  });

  it('오늘 수주 기록 초기화는 KST 자정 이후 행만 지운다', () => {
    expect(debugTablePlan('bounty.resetToday', now)).toEqual({
      table: 'bounty_accepts', op: 'delete', since: { column: 'accepted_at', iso: kstDayStartISO(now) },
    });
  });

  it('도전권·진행 정리는 본인 행 전체를 지운다', () => {
    expect(debugTablePlan('bounty.clearTickets', now)).toEqual({ table: 'bounty_tickets', op: 'delete' });
    expect(debugTablePlan('bounty.clearProgress', now)).toEqual({ table: 'bounty_progress', op: 'delete' });
  });
});
