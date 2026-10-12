// 액션 스키마 검증 — 서버 입구의 유일한 화이트리스트 (api/action.ts route가 호출).
// 클라는 이 모듈의 런타임을 import하지 않는다 (타입만) — 번들에 zod가 타면 안 된다.
// 배경: bugs.md — catch의 judgment enum 미검증 (임의 문자열 → NaN → 전설 확정).
import { describe, it, expect } from 'vitest';
import { parseAction, ACTION_SCHEMA_TYPES } from './actionSchema';
import { ACTION_TYPES } from './actions';

describe('parseAction', () => {
  it('알 수 없는 judgment를 거부한다 — 전설 확정 주입 차단', () => {
    expect(parseAction({ type: 'catch', spot: 'pond', judgment: 'legendary-hax' })).toBeNull();
    expect(parseAction({ type: 'catch', spot: 'pond', judgment: null })).toBeNull();
    expect(parseAction({ type: 'catch', spot: 'pond' })).toBeNull();
  });

  it('정상 catch 4판정을 통과시킨다', () => {
    for (const judgment of ['perfect', 'good', 'normal', 'auto']) {
      const a = parseAction({ type: 'catch', spot: 'pond', judgment });
      expect(a).toEqual({ type: 'catch', spot: 'pond', judgment });
    }
  });

  it('알 수 없는 type·비객체를 거부한다', () => {
    expect(parseAction({ type: 'fish', spot: 'pond', judgment: 'normal' })).toBeNull();
    expect(parseAction(null)).toBeNull();
    expect(parseAction('catch')).toBeNull();
  });

  it('스칼라 액션의 형태를 검증한다', () => {
    expect(parseAction({ type: 'sell', uids: ['a', 'b'] })?.type).toBe('sell');
    expect(parseAction({ type: 'sell', uids: 'a' })).toBeNull();
    expect(parseAction({ type: 'setLocked', uids: [], locked: true })?.type).toBe('setLocked');
    expect(parseAction({ type: 'setLocked', uids: [] })).toBeNull();
    expect(parseAction({ type: 'sendLetter', text: 'hi' })?.type).toBe('sendLetter');
    expect(parseAction({ type: 'sendLetter', text: 7 })).toBeNull();
  });

  it('setNickname은 스키마를 통과한다 — 형태 검증은 리듀서 몫', () => {
    expect(parseAction({ type: 'setNickname', nickname: '날치' })?.type).toBe('setNickname');
    expect(parseAction({ type: 'setNickname', nickname: '__' })?.type).toBe('setNickname');
    expect(parseAction({ type: 'setNickname' })).toBeNull();
  });

  it('스키마 키 집합이 리듀서 유니온과 일치한다 — 드리프트 방지', () => {
    expect([...ACTION_SCHEMA_TYPES].sort()).toEqual([...ACTION_TYPES].sort());
  });
});
