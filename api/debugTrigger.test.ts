// 테스트용 트리거 허용 판정 — 운영 배포는 어떤 경우에도 막고, 스테이징·로컬은 소유자·로컬 오리진만 연다.
import { describe, it, expect } from 'vitest';
import { debugTriggerAllowed } from './action.js';

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
