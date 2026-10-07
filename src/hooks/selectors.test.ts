// 게임 상태 셀렉터 — 파생 표시값의 단일 출처.
// useGame이 통째 game을 내려주는 동안은 호출부(useMemo 등)가 이 함수들로 파생값을
// 읽고, 나중에 외부 스토어로 옮기면 같은 함수가 구독 셀렉터가 된다.
import { describe, it, expect } from 'vitest';
import { selectBagStatus } from './selectors';
import { newState } from '../game/logic';
import type { GameState } from '../game/logic';

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

describe('selectBagStatus', () => {
  it('맨발 상한 60에 현재 수량을 함께 돌려준다', () => {
    const s = selectBagStatus(seed({ boat: 0 }));
    expect(s).toMatchObject({ count: 0, cap: 60, full: false });
  });

  it('상한 도달이면 full이다 — 래칫(초과 보유)은 상한으로 삼는다', () => {
    const bag = Array.from({ length: 70 }, (_, i) => ({
      uid: `u${i}`, fishId: 'carp', form: 'normal' as const, size: 10,
      caughtAt: null, spot: null, judgment: null, locked: false,
    }));
    const s = selectBagStatus(seed({ boat: 0, bag }));
    expect(s.count).toBe(70);
    expect(s.cap).toBe(70);
    expect(s.full).toBe(true);
  });
});
