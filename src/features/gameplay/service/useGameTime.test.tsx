import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { newState } from '../../../game/rules/logic';
import { slotPollIntervalMs } from '../../kitchen/model/slots';
import { useNow } from './useGameTime';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useNow 조건부 폴링', () => {
  it('1분 미만 활성 슬롯이 없으면 5초마다, 1분 미만 활성 슬롯이 있으면 1초마다 갱신한다', () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-11-12T00:00:00.000Z');
    vi.setSystemTime(t0);

    const longGame = {
      ...newState(),
      slots: { lunch: { id: 'cook-lunch-bite', endsAt: new Date(t0.getTime() + 120_000).toISOString() }, bait: null },
    };
    const { result, rerender } = renderHook(
      ({ g }) => useNow(now => slotPollIntervalMs(g, now)),
      { initialProps: { g: longGame } },
    );

    expect(result.current).toBe('2026-11-12T00:00:00.000Z');
    act(() => { vi.advanceTimersByTime(1_000); });
    // 5초 폴링이라 1초에는 갱신되지 않는다
    expect(result.current).toBe('2026-11-12T00:00:00.000Z');
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(result.current).toBe('2026-11-12T00:00:05.000Z');

    const shortGame = {
      ...newState(),
      slots: { lunch: { id: 'cook-lunch-bite', endsAt: new Date(t0.getTime() + 40_000).toISOString() }, bait: null },
    };
    rerender({ g: shortGame });
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(result.current).toBe('2026-11-12T00:00:06.000Z');
  });
});
