// 게임 상태 셀렉터 — 파생 표시값의 단일 출처.
// useGame이 통째 game을 내려주는 동안은 호출부(useMemo 등)가 이 함수들로 파생값을
// 읽고, 나중에 외부 스토어로 옮기면 같은 함수가 구독 셀렉터가 된다.
import { describe, it, expect } from 'vitest';
import { selectBagStatus, selectBaitInventory, selectOwnedArtifacts } from './selectors';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { BAITS } from '../../../game/content/baits';

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

describe('selectBagStatus — 채움 비율과 경고 단계', () => {
  const bagOf = (n: number) => Array.from({ length: n }, (_, i) => ({
    uid: `u${i}`, fishId: 'carp', form: 'normal' as const, size: 10,
    caughtAt: null, spot: null, judgment: null, locked: false,
  }));

  it('비율은 내림한 정수 퍼센트다', () => {
    expect(selectBagStatus(seed({ boat: 0, bag: bagOf(10) })).percent).toBe(16); // 10/60 = 16.6…
  });

  it('75% 미만은 normal, 75% 이상은 warn, 95% 이상은 danger', () => {
    expect(selectBagStatus(seed({ boat: 0, bag: bagOf(44) })).level).toBe('normal'); // 73%
    expect(selectBagStatus(seed({ boat: 0, bag: bagOf(45) })).level).toBe('warn');   // 75%
    expect(selectBagStatus(seed({ boat: 0, bag: bagOf(56) })).level).toBe('warn');   // 93%
    expect(selectBagStatus(seed({ boat: 0, bag: bagOf(57) })).level).toBe('danger'); // 95%
  });
});

describe('selectBaitInventory', () => {
  it('레지스트리 순서와 보유 수량을 반환하고 없는 미끼는 0으로 채운다', () => {
    const inventory = selectBaitInventory({ [BAITS[0].id]: 3 });
    expect(inventory.map(row => row.bait.id)).toEqual(BAITS.map(bait => bait.id));
    expect(inventory[0].count).toBe(3);
    expect(inventory.slice(1).every(row => row.count === 0)).toBe(true);
  });
});

describe('selectOwnedArtifacts', () => {
  it('보유 유물을 레지스트리 순서로 돌려주고, 모르는 id는 건너뛴다', () => {
    const owned = selectOwnedArtifacts(seed({ artifacts: ['varuna-scale', 'ghost', 'abyss-angler'] }));
    expect(owned.map(a => a.id)).toEqual(['abyss-angler', 'varuna-scale']);
  });

  it('보유가 없으면 빈 목록이다', () => {
    expect(selectOwnedArtifacts(seed())).toEqual([]);
  });
});
