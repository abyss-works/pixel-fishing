// 시계 칩 — 낮/밤 판정(phase)을 그대로 따라 밤(어둠 0 경계 포함)에는 달 아이콘, 낮에는 해 아이콘을 보인다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const timeState = vi.hoisted(() => ({
  clock: '22:00',
  phase: 'night' as 'day' | 'night',
  dark: 0,
}));
vi.mock('../../../features/gameplay/service/useGameTime', () => ({
  useGameTime: () => timeState,
}));

import TimeBadge from './TimeBadge';

afterEach(cleanup);

describe('TimeBadge 낮/밤 아이콘', () => {
  it('밤 판정(phase === "night")이면 어둠이 0이어도 달 아이콘을 보인다', () => {
    timeState.clock = '22:00';
    timeState.phase = 'night';
    timeState.dark = 0;
    const { container } = render(<TimeBadge />);
    expect(screen.getByText('22:00')).toBeInTheDocument();
    expect(container.querySelector('[data-glyph="moon"]')).not.toBeNull();
    expect(container.querySelector('[data-glyph="sun"]')).toBeNull();
  });

  it('낮 판정(phase === "day")이면 해 아이콘을 보인다', () => {
    timeState.clock = '06:00';
    timeState.phase = 'day';
    timeState.dark = 0;
    const { container } = render(<TimeBadge />);
    expect(screen.getByText('06:00')).toBeInTheDocument();
    expect(container.querySelector('[data-glyph="sun"]')).not.toBeNull();
    expect(container.querySelector('[data-glyph="moon"]')).toBeNull();
  });
});
