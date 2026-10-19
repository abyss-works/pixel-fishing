import { describe, expect, it } from 'vitest';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { selectEncounter } from './challenge';

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });
const QUEST = 'pacific-named-megalodon';

describe('selectEncounter', () => {
  it('가속 배수는 유물이 없으면 1이다', () => {
    expect(selectEncounter(seed(), QUEST)?.speedupScale).toBe(1);
  });

  it('해구의 이빨이 있으면 가속 배수가 줄어든다', () => {
    expect(selectEncounter(seed({ artifacts: ['abyss-angler'] }), QUEST)?.speedupScale).toBeCloseTo(0.9, 10);
  });
});
