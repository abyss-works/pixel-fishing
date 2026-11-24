// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';

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

  it('계정 전환(adoptAccount)으로 만료 전 슬롯이 null로 바뀌어도 오탐 만료 알림을 내지 않는다', () => {
    const notify = vi.fn();
    const activeGame: GameState = {
      ...newState(),
      boat: 2,
      slots: {
        lunch: { id: 'cook-lunch-bite', endsAt: '2026-01-01T00:10:00.000Z' },
        bait: null,
      },
    };
    const { rerender } = renderHook(({ g }) => useSlotExpiryAlerts(g, notify), {
      initialProps: { g: activeGame },
    });

    // clock.now(00:00:00) < endsAt(00:10:00) 상태에서 계정 전환으로 슬롯이 비워짐
    const switchedAccountGame: GameState = {
      ...newState(),
      boat: 2,
      slots: { lunch: null, bait: null },
    };
    rerender({ g: switchedAccountGame });
    expect(notify).not.toHaveBeenCalled();
  });

  it('bait2 슬롯이 만료되면 1회 알리고, 만료 전 계정 전환으로 bait2가 비어도 오탐 알림을 내지 않는다', () => {
    const notify = vi.fn();
    const dualGame: GameState = {
      ...newState(),
      boat: 5,
      artifacts: ['sargasso-net'],
      slots: {
        lunch: null,
        bait: { id: 'cook-bait-rare', endsAt: '2026-01-01T00:05:00.000Z' },
        bait2: { id: 'cook-bait-epic', endsAt: '2026-01-01T00:02:30.000Z' },
      },
    };
    const { rerender } = renderHook(({ g }) => useSlotExpiryAlerts(g, notify), {
      initialProps: { g: dualGame },
    });

    clock.now = '2026-01-01T00:02:31.000Z';
    rerender({ g: dualGame });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('큐베브 미끼(영웅) 효과가 끝났어요.');

    // 만료 전 bait(00:05:00)가 계정 전환으로 null이 돼도 오탐 알림 없음
    const switched: GameState = { ...newState(), boat: 5, slots: { lunch: null, bait: null } };
    rerender({ g: switched });
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
