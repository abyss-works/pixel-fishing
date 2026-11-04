import { describe, expect, it } from 'vitest';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { recordDuelFailure, newNamedPity } from '../../../game/rules/pity';
import { selectEncounter } from './challenge';

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });
const QUEST = 'pacific-named-megalodon';
const NOW = '2027-01-01T03:00:00Z';

describe('selectEncounter', () => {
  it('가속 배수는 유물이 없으면 1이다', () => {
    expect(selectEncounter(seed(), QUEST, NOW)?.speedupScale).toBe(1);
  });

  it('상처가 없으면 결투 체력이 네임드 체력과 같다', () => {
    const e = selectEncounter(seed(), QUEST, NOW)!;
    expect(e.hp).toBe(e.maxHp);
  });

  it('그날 상처가 있으면 결투 체력이 그만큼 줄고 전체 칸은 네임드 체력이다', () => {
    const e = selectEncounter(seed({ namedPity: recordDuelFailure(newNamedPity(), NOW, QUEST, 2) }), QUEST, NOW)!;
    expect(e.hp).toBe(e.maxHp - 2);
  });

  it('해구의 이빨이 있으면 가속 배수가 줄어든다', () => {
    expect(selectEncounter(seed({ artifacts: ['abyss-angler'] }), QUEST, NOW)?.speedupScale).toBeCloseTo(0.9, 10);
  });
});
