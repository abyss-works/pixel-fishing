// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { newState } from '../../../game/rules/logic';

const clock = vi.hoisted(() => ({ now: '2026-01-01T00:00:00.000Z' }));
vi.mock('../../gameplay/service/useGameTime', () => ({
  useNow: () => clock.now,
}));

import { useSlotExpiryAlerts } from './useSlotExpiryAlerts';

afterEach(() => {
  cleanup();
  clock.now = '2026-01-01T00:00:00.000Z';
});

describe('useSlotExpiryAlerts', () => {
  it('활성 슬롯 효과가 만료 시각을 지나 꺼지면 1회 알린다', () => {
    const notify = vi.fn();
    const game = {
      ...newState(),
      boat: 2,
      slots: {
        lunch: { id: 'cook-lunch-bite', endsAt: '2026-01-01T00:10:00.000Z' },
        bait: null,
      },
    };
    const { rerender } = renderHook(({ g }) => useSlotExpiryAlerts(g, notify), {
      initialProps: { g: game },
    });
    expect(notify).not.toHaveBeenCalled();

    clock.now = '2026-01-01T00:10:01.000Z';
    rerender({ g: game });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('끝났어요.'));
  });
});
