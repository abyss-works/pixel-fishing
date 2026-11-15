import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { newState } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import type { DispatchResult } from '../../../../features/gameplay/service/types';
import { resetKeyScopes } from '../../../ui/hotkeys';
import AchievementsModal from './AchievementsModal';

afterEach(() => { cleanup(); resetKeyScopes(); });

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

function show(game: GameState, result: DispatchResult) {
  const dispatch = vi.fn(() => result);
  const setToast = vi.fn();
  render(<AchievementsModal game={game} dispatch={dispatch} setToast={setToast} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: '모두 받기' }));
  return { dispatch, setToast };
}

const claimable = seed({ achievements: { 'zone-basic-pacific': 'claimable', 'variant-village': 'claimable' } });
const okAll = (gold: number, hats: string[]): DispatchResult => ({
  status: 'ok', state: claimable, result: { type: 'claimAllAchievements', gold, hats },
});

describe('업적 창 모두 받기', () => {
  it('받은 골드 합과 모자 수를 금색 안내로 알린다', () => {
    const { setToast } = show(claimable, okAll(25_000, ['straw-hat']));
    expect(setToast).toHaveBeenCalledWith('업적 보상으로 25,000G와 모자 1개 받았어요.', 'gold');
  });

  it('골드만 받으면 모자 문구를 넣지 않는다', () => {
    const { setToast } = show(claimable, okAll(25_000, []));
    expect(setToast).toHaveBeenCalledWith('업적 보상으로 25,000G 받았어요.', 'gold');
  });

  it('모자만 받으면 모자 수만 알린다', () => {
    const { setToast } = show(claimable, okAll(0, ['straw-hat', 'sou-wester']));
    expect(setToast).toHaveBeenCalledWith('업적 보상으로 모자 2개 받았어요.', 'gold');
  });
});
