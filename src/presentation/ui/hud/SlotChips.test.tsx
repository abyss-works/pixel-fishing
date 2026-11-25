import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { COOKING_UNLOCK_BOAT } from '../../../game/content/cooking';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';

const NOW = '2026-11-12T00:00:00.000Z';
vi.mock('../../../features/gameplay/service/useGameTime', () => ({ useNow: () => NOW }));

import SlotChips from './SlotChips';

afterEach(cleanup);

const at = (ms: number): string => new Date(Date.parse(NOW) + ms).toISOString();

describe('SlotChips', () => {
  it('도시락과 두 개의 미끼가 모두 켜져도 React key 중복 경고 없이 세 칩을 모두 그린다', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const game: GameState = {
      ...newState(),
      boat: COOKING_UNLOCK_BOAT,
      artifacts: ['sargasso-net'],
      slots: {
        lunch: { id: 'cook-lunch-bite', endsAt: at(60 * 60_000) },
        bait: { id: 'cook-bait-rare', endsAt: at(150_000) },
        bait2: { id: 'cook-bait-epic', endsAt: at(120_000) },
      },
    };
    render(<SlotChips game={game} accountState="account" />);
    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(3);
    expect(groups.map(g => g.getAttribute('aria-label'))).toEqual([
      '도시락 칸, 가루디야, 남은 시간 1시간',
      '미끼 칸, 롱페퍼 미끼(희귀), 남은 시간 3분',
      '미끼 칸, 큐베브 미끼(영웅), 남은 시간 2분',
    ]);
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
