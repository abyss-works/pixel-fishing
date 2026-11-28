import { describe, expect, it } from 'vitest';
import { EVENT2_STANDARD_SPEC } from '../content/eventFish';
import {
  CATCH_EVENT_TYPES,
  demoteJudgment,
  evaluateCatchTiming,
  isEventCatchPayload,
  spotRuleProfileOf,
} from './catchPipeline';

describe('catchPipeline 공통 포획 규칙', () => {
  it('해역별 규칙 프로필이 일반 해역과 championship을 정확히 구분한다', () => {
    const regular = spotRuleProfileOf('sea');
    expect(regular.mode).toBe('regular');
    expect(regular.rodSpec).toEqual({ kind: 'player' });
    expect(regular.valueKind).toBe('gold');
    expect(regular.supportsIdleQueue).toBe(true);

    const champ = spotRuleProfileOf('championship');
    expect(champ.mode).toBe('event');
    expect(champ.rodSpec).toEqual({
      kind: 'standard',
      rodLevel: EVENT2_STANDARD_SPEC.rodLevel,
      power: EVENT2_STANDARD_SPEC.power,
      powerReq: EVENT2_STANDARD_SPEC.powerReq,
      idleBoost: EVENT2_STANDARD_SPEC.idleBoost,
    });
    expect(champ.valueKind).toBe('score');
    expect(champ.supportsBag).toBe(false);
    expect(champ.supportsIdleQueue).toBe(false);
  });

  it('파워 존 폭에 따라 수동 판정을 강등한다', () => {
    expect(demoteJudgment('perfect', { red: 0, yellow: 20 })).toBe('good');
    expect(demoteJudgment('perfect', { red: 0, yellow: 0 })).toBe('normal');
    expect(demoteJudgment('good', { red: 0, yellow: 0 })).toBe('normal');
    expect(demoteJudgment('perfect', { red: 10, yellow: 30 })).toBe('perfect');
    expect(demoteJudgment('auto', { red: 0, yellow: 0 })).toBe('auto');
  });

  it('일반·이벤트 공통으로 타이밍 위치와 claimCheck를 계산한다', () => {
    const manual = evaluateCatchTiming({
      claimedJudgment: 'normal',
      biteElapsed: 500,
      rodLevel: EVENT2_STANDARD_SPEC.rodLevel,
      pz: { yellow: 30, red: 10 },
      redZoneSeed: 'u1:1',
    });
    expect(manual.pos).not.toBeNull();
    expect(manual.redPos).not.toBeNull();
    expect(manual.claimCheck).not.toBeNull();

    const idle = evaluateCatchTiming({
      claimedJudgment: 'auto',
      rodLevel: 1,
      pz: { yellow: 30, red: 10 },
      redZoneSeed: 'u1:1',
    });
    expect(idle.redPos).toBeNull();
    expect(idle.claimCheck).toBeNull();
  });

  it('신규 type=catch(mode=event)와 구형 type=eventCatch를 모두 이벤트 포획으로 판별한다', () => {
    expect(CATCH_EVENT_TYPES).toEqual(['catch', 'eventCatch']);
    expect(isEventCatchPayload('eventCatch', { fishId: 'event-glaaki' })).toBe(true);
    expect(isEventCatchPayload('catch', { mode: 'event', spot: 'championship' })).toBe(true);
    expect(isEventCatchPayload('catch', { spot: 'championship' })).toBe(true);
    expect(isEventCatchPayload('catch', { mode: 'regular', spot: 'sea' })).toBe(false);
    expect(isEventCatchPayload('catch', { spot: 'sea' })).toBe(false);
  });
});
