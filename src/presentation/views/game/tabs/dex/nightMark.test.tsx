import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FISH, newState } from '../../../../../game/rules/logic';
import type { GameState } from '../../../../../game/rules/logic';
import { ZONE_IDS } from '../../../../../game/content/zones';
import type { ZoneId } from '../../../../../game/content/zones';
import { selectDexGrid } from '../../../../../features/dex/model/catalog';
import { resetBagView, setBagLayout } from '../bag/bagView';
import DexGrid from './DexGrid';
import BagTab from '../bag/BagTab';

afterEach(() => { cleanup(); resetBagView(); });

const MARK = '[data-night-mark]';

function pick() {
  const entries = ZONE_IDS.flatMap(zone =>
    selectDexGrid(newState(), zone, 'normal').spots.flatMap(s => s.fishes.map(e => ({ zone, fish: e.fish }))));
  const night = entries.find(e => e.fish.night)!;
  const day = entries.find(e => e.zone === night.zone && !e.fish.night)!;
  return { zone: night.zone as ZoneId, night: night.fish, day: day.fish };
}

function found(ids: string[]): GameState {
  const g = newState();
  for (const id of ids) g.dex[id] = { normal: { count: 1, maxSize: 20, first: '2026-10-18' } };
  return g;
}

describe('밤 전용 어종 카드 표식', () => {
  it('도감: 발견한 밤 전용 카드에만 달 아이콘이 있다', () => {
    const { zone, night, day } = pick();
    const { container } = render(
      <DexGrid game={found([night.id, day.id])} view="base" sub={zone} onSub={() => {}} />);
    const marks = container.querySelectorAll(MARK);
    expect(marks).toHaveLength(1);
    expect(marks[0].closest('button')!.textContent).toContain(night.name);
    expect(marks[0].querySelector('[data-glyph="moon"]')).not.toBeNull();
  });

  it('도감: 미발견 밤 전용 카드에는 없다', () => {
    const { zone } = pick();
    const { container } = render(<DexGrid game={newState()} view="base" sub={zone} onSub={() => {}} />);
    expect(container.querySelectorAll(MARK)).toHaveLength(0);
  });

  it('가방 카드뷰: 발견한 밤 전용 카드에만 있고 상시·미발견에는 없다', () => {
    const { night, day } = pick();
    setBagLayout('cards');
    const client = new QueryClient();
    const render_ = (g: GameState) => render(
      <QueryClientProvider client={client}>
        <BagTab sellBonus={0} game={g} dispatch={vi.fn()} setToast={() => {}} />
      </QueryClientProvider>);
    const { container } = render_(found([night.id, day.id]));
    const marks = container.querySelectorAll(MARK);
    expect(marks).toHaveLength(1);
    expect(marks[0].closest('button')!.getAttribute('aria-label')).toContain(night.name);
    cleanup();
    const none = render_(newState());
    expect(none.container.querySelectorAll(MARK)).toHaveLength(0);
    expect(FISH.some(f => f.night)).toBe(true);
  });
});
