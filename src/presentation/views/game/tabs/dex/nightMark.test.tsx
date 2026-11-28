import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FISH, newState } from '../../../../../game/rules/logic';
import type { GameState } from '../../../../../game/rules/logic';
import { ZONE_IDS, zoneGroup } from '../../../../../game/content/zones';
import type { ZoneId } from '../../../../../game/content/zones';
import { setCurrentSpot } from '../../../../../game/world/currentSpot';
import { selectDexGrid } from '../../../../../features/dex/model/catalog';
import { resetBagView, setBagLayout } from '../bag/bagView';
import DexGrid from './DexGrid';
import BagTab from '../bag/BagTab';
import VRegion from '../region/VRegion';

afterEach(() => {
  cleanup();
  resetBagView();
  act(() => {
    setCurrentSpot(null);
  });
});

const MARK = '[data-night-mark]';
const NIGHT_TOTAL = FISH.filter(f => f.night).length;

function pick() {
  const entries = ZONE_IDS.flatMap(zone =>
    selectDexGrid(newState(), zone, 'normal').spots.flatMap(s => s.fishes.map(e => ({ zone, spot: s.spot.id, fish: e.fish }))));
  const night = entries.find(e => e.fish.night)!;
  const day = entries.find(e => e.zone === night.zone && !e.fish.night)!;
  const spotDay = entries.find(e => e.spot === night.spot && !e.fish.night)!;
  const zoneNightCount = new Set(entries.filter(e => e.zone === night.zone && e.fish.night).map(e => e.fish.id)).size;
  const spotNightCount = entries.filter(e => e.spot === night.spot && e.fish.night).length;
  return {
    zone: night.zone as ZoneId,
    region: zoneGroup(night.zone as ZoneId),
    spot: night.spot,
    night: night.fish,
    day: day.fish,
    spotDay: spotDay.fish,
    zoneNightCount,
    spotNightCount,
  };
}

function found(ids: string[], form: 'normal' | 'variant' = 'normal'): GameState {
  const g = newState();
  for (const id of ids) g.dex[id] = { [form]: { count: 1, maxSize: 20, first: '2026-10-18' } };
  return g;
}

describe('밤 전용 어종 카드 표식', () => {
  it('도감 일반: 발견 밤 전용은 하늘색, 미발견(???) 밤 전용은 어두운 톤 달 아이콘을 표시하고 상시 어종에는 없다', () => {
    const { zone, night, day, zoneNightCount } = pick();
    const { container } = render(
      <DexGrid game={found([night.id, day.id])} form="normal" onToggleForm={() => {}} sub={zone} onSub={() => {}} />);
    const marks = container.querySelectorAll(MARK);
    expect(marks).toHaveLength(zoneNightCount);
    const foundMark = [...marks].find(m => m.closest('button'))!;
    expect(foundMark.closest('button')!.textContent).toContain(night.name);
    expect(foundMark).toHaveClass('text-accent');
    expect(foundMark.querySelector('[data-glyph="moon"]')).not.toBeNull();

    cleanup();
    const unseen = render(<DexGrid game={newState()} form="normal" onToggleForm={() => {}} sub={zone} onSub={() => {}} />);
    const unseenMarks = unseen.container.querySelectorAll(MARK);
    expect(unseenMarks).toHaveLength(zoneNightCount);
    for (const m of unseenMarks) {
      expect(m.closest('button')).toBeNull();
      expect(m).toHaveClass('text-[#6797b8]');
      expect(m.querySelector('[data-glyph="moon"]')).not.toBeNull();
    }
  });

  it('도감 돌연변이: 발견·미발견 밤 전용 카드 모두에 달 아이콘이 있고 상시 어종에는 없다', () => {
    const { zone, night, day, zoneNightCount } = pick();
    const { container } = render(
      <DexGrid game={found([night.id, day.id], 'variant')} form="variant" onToggleForm={() => {}} sub={zone} onSub={() => {}} />);
    const marks = container.querySelectorAll(MARK);
    expect(marks).toHaveLength(zoneNightCount);
    const foundMark = [...marks].find(m => m.closest('button'))!;
    expect(foundMark.closest('button')!.textContent).toContain(night.variant.name);
    expect(foundMark).toHaveClass('text-accent');

    cleanup();
    const unseen = render(<DexGrid game={newState()} form="variant" onToggleForm={() => {}} sub={zone} onSub={() => {}} />);
    const unseenMarks = unseen.container.querySelectorAll(MARK);
    expect(unseenMarks).toHaveLength(zoneNightCount);
    for (const m of unseenMarks) expect(m).toHaveClass('text-[#6797b8]');
  });

  it('가방 카드뷰: 발견·미발견(???) 밤 전용 카드 모두에 달 아이콘이 있고 상시 어종에는 없다', () => {
    const { night, day } = pick();
    setBagLayout('cards');
    const client = new QueryClient();
    const render_ = (g: GameState) => render(
      <QueryClientProvider client={client}>
        <BagTab sellBonus={0} game={g} dispatch={vi.fn()} setToast={() => {}} />
      </QueryClientProvider>);
    const { container } = render_(found([night.id, day.id]));
    const marks = container.querySelectorAll(MARK);
    expect(marks).toHaveLength(NIGHT_TOTAL);
    const foundMarks = [...marks].filter(m => m.closest('button'));
    expect(foundMarks).toHaveLength(1);
    expect(foundMarks[0].closest('button')!.getAttribute('aria-label')).toContain(night.name);
    expect(foundMarks[0]).toHaveClass('text-accent');
    const unseenMarks = [...marks].filter(m => !m.closest('button'));
    expect(unseenMarks).toHaveLength(NIGHT_TOTAL - 1);
    expect(unseenMarks[0]).toHaveClass('text-[#6797b8]');

    cleanup();
    const none = render_(newState());
    const noneMarks = none.container.querySelectorAll(MARK);
    expect(noneMarks).toHaveLength(NIGHT_TOTAL);
    for (const m of noneMarks) expect(m).toHaveClass('text-[#6797b8]');
  });

  it('지역 탭 어군 정보: 발견·미발견(???) 밤 전용 어종 카드 모두에 달 아이콘이 있고 상시 어종에는 없다', () => {
    const { region, spot, night, spotDay, spotNightCount } = pick();
    act(() => setCurrentSpot(spot));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <VRegion region={region} game={found([night.id, spotDay.id])} />
      </QueryClientProvider>);
    const marks = container.querySelectorAll(MARK);
    expect(marks).toHaveLength(spotNightCount);
    const foundMark = [...marks].find(m => m.closest('button'))!;
    expect(foundMark.closest('button')!.textContent).toContain(night.name);
    expect(foundMark).toHaveClass('text-accent');

    cleanup();
    const unseen = render(
      <QueryClientProvider client={client}>
        <VRegion region={region} game={newState()} />
      </QueryClientProvider>);
    const unseenMarks = unseen.container.querySelectorAll(MARK);
    expect(unseenMarks).toHaveLength(spotNightCount);
    for (const m of unseenMarks) expect(m).toHaveClass('text-[#6797b8]');
  });

  it('달 아이콘 호버 시 밤 전용 어종·출현 시각·달빛 미끼 안내 툴팁을 보인다', () => {
    const { zone } = pick();
    const { container } = render(<DexGrid game={newState()} form="normal" onToggleForm={() => {}} sub={zone} onSub={() => {}} />);
    const mark = container.querySelector(MARK)!;
    fireEvent.mouseEnter(mark.parentElement!);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('밤 전용 어종');
    expect(tip).toHaveTextContent('출현 시각(게임)');
    expect(tip).toHaveTextContent('22:00~06:00');
    expect(tip).toHaveTextContent('달빛 미끼를 쓰면 낮에도 낚여요.');
    expect(tip.textContent).not.toContain('·');
  });

  it('도감·지역 탭 단독 ? 범례와 가방 카드뷰 통합 ? 범례 툴팁을 제공한다', () => {
    const { zone, region, spot } = pick();
    render(<DexGrid game={newState()} form="normal" onToggleForm={() => {}} sub={zone} onSub={() => {}} />);
    const dexLegend = screen.getByRole('button', { name: '밤 전용 어종 아이콘 안내' });
    fireEvent.mouseEnter(dexLegend.parentElement!);
    const dexTip = screen.getByRole('tooltip');
    expect(dexTip).toHaveTextContent('밤 전용 어종');
    expect(dexTip).toHaveTextContent('밤(게임 22:00~06:00)에만 낚여요.');
    expect(dexTip.querySelector('.border-t')).not.toBeNull();
    fireEvent.mouseLeave(dexLegend.parentElement!);

    cleanup();
    act(() => setCurrentSpot(spot));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <VRegion region={region} game={newState()} />
      </QueryClientProvider>);
    const regionLegend = screen.getByRole('button', { name: '밤 전용 어종 아이콘 안내' });
    fireEvent.mouseEnter(regionLegend.parentElement!);
    const regionTip = screen.getByRole('tooltip');
    expect(regionTip).toHaveTextContent('밤 전용 어종');
    expect(regionTip).toHaveTextContent('밤(게임 22:00~06:00)에만 낚여요.');
    fireEvent.mouseLeave(regionLegend.parentElement!);

    cleanup();
    setBagLayout('cards');
    render(
      <QueryClientProvider client={client}>
        <BagTab sellBonus={0} game={newState()} dispatch={vi.fn()} setToast={() => {}} />
      </QueryClientProvider>);
    const bagLegend = screen.getByRole('button', { name: '개체 표시' });
    fireEvent.mouseEnter(bagLegend.parentElement!);
    const bagTip = screen.getByRole('tooltip');
    expect(within(bagTip).getByText('최대 크기')).toBeInTheDocument();
    expect(within(bagTip).getByText('돌연변이')).toBeInTheDocument();
    expect(within(bagTip).getByText('밤 전용 어종')).toBeInTheDocument();
    expect(bagTip).toHaveTextContent('밤(게임 22:00~06:00)에만 낚여요.');
    expect(bagTip.querySelector('[data-glyph="moon"]')).not.toBeNull();
    expect(bagTip.querySelector('.border-t')).not.toBeNull();
  });
});
