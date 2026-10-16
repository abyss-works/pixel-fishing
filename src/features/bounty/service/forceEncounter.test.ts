// 테스트용 강제 조우 — 개발 도구 패널이 켜 두면 다음 캐치 요청에 표시가 실린다.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  armForceEncounter, disarmForceEncounter, isForceEncounterArmed, settleForcedEncounter, withForcedEncounter,
} from './forceEncounter';

describe('강제 조우 표시', () => {
  beforeEach(() => { disarmForceEncounter(); });

  it('꺼져 있으면 액션을 그대로 보낸다', () => {
    const action = { type: 'catch', spot: 'sea', judgment: 'auto' } as const;
    expect(withForcedEncounter(action)).toBe(action);
  });

  it('켜 두면 캐치에만 표시를 싣는다', () => {
    armForceEncounter();
    expect(withForcedEncounter({ type: 'catch', spot: 'sea', judgment: 'auto' }))
      .toEqual({ type: 'catch', spot: 'sea', judgment: 'auto', forceEncounter: true });
    expect(withForcedEncounter({ type: 'sell', uids: [] })).toEqual({ type: 'sell', uids: [] });
  });

  it('도전권이 발급된 캐치 결과를 받으면 꺼진다 — 수주 구역 밖의 캐치는 표시를 유지한다', () => {
    armForceEncounter();
    settleForcedEncounter({ type: 'catch', ticket: undefined });
    expect(isForceEncounterArmed()).toBe(true);
    settleForcedEncounter({ type: 'catch', ticket: 'pacific-named-megalodon' });
    expect(isForceEncounterArmed()).toBe(false);
  });
});
