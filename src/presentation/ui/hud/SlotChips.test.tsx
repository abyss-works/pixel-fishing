import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { COOKING_UNLOCK_BOAT } from '../../../game/content/cooking';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { gameDayOf } from '../../../game/rules/time';

const NOW = '2026-11-12T00:00:00.000Z';
vi.mock('../../../features/gameplay/service/useGameTime', () => ({ useNow: () => NOW }));

import SlotChips from './SlotChips';

afterEach(cleanup);

const at = (ms: number): string => new Date(Date.parse(NOW) + ms).toISOString();

describe('SlotChips (보너스 통합 칩)', () => {
  it('요리가 열리기 전이고 활성 효과도 없으면 잠금 칩 하나와 진행 조건 툴팁을 보인다', () => {
    render(<SlotChips game={{ ...newState(), boat: COOKING_UNLOCK_BOAT - 1 }} accountState="account" />);
    const group = screen.getByRole('group', { name: '활성 효과' });
    expect(group).toHaveTextContent('효과');
    expect(group.querySelector('[data-glyph="lock"]')).not.toBeNull();
    fireEvent.mouseEnter(group.parentElement!);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('잠김');
    expect(tip).toHaveTextContent('인도양 항로가 열리면 부엌에서 도시락과 미끼를 만들 수 있어요.');
  });

  it('요리가 열린 뒤 활성 효과가 없으면 네모 점과 흐린 효과 0 버튼을 보이고, 호버 시 4행 2열 최소 표를 연다', () => {
    const onOpenEffects = vi.fn();
    render(<SlotChips game={{ ...newState(), boat: COOKING_UNLOCK_BOAT }} accountState="account" onOpenEffects={onOpenEffects} />);
    const btn = screen.getByRole('button', { name: '활성 효과 없음' });
    expect(btn).toHaveClass('h-[26px]', 'text-xs');
    expect(btn).toHaveTextContent('효과0');
    expect(btn.className).toContain('text-text-dim');
    const dot = btn.querySelector('span[aria-hidden="true"]')!;
    expect(dot.className).toContain('size-1.5');
    expect(dot.className).not.toContain('rounded-full');

    fireEvent.mouseEnter(btn);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('도시락없음');
    expect(tip).toHaveTextContent('미끼없음');
    expect(tip).toHaveTextContent('비약없음');
    expect(tip).toHaveTextContent('운세없음');

    fireEvent.click(btn);
    expect(onOpenEffects).toHaveBeenCalledTimes(1);
  });

  it('활성 효과가 있으면 한 칩에 활성 수를 모으고, 호버 시 4행 2열 최소 정보만 보이며 클릭 시 상세 창 콜백을 부른다', () => {
    const onOpenEffects = vi.fn();
    const day = gameDayOf(NOW);
    const game: GameState = {
      ...newState(),
      boat: COOKING_UNLOCK_BOAT,
      artifacts: ['sargasso-net'],
      slots: {
        lunch: { id: 'cook-lunch-bite', endsAt: at(60 * 60_000) },
        bait: { id: 'cook-bait-rare', endsAt: at(150_000) },
        bait2: { id: 'cook-bait-epic', endsAt: at(120_000) },
      },
      potions: { 'luck-small': day },
      fortune: { day, kind: 'shadow', index: 5 },
    };
    render(<SlotChips game={game} accountState="account" onOpenEffects={onOpenEffects} />);
    const btn = screen.getByRole('button', { name: '활성 효과 5개' });
    expect(btn).toHaveTextContent('효과5');
    expect(btn.className).toContain('border-accent');

    fireEvent.mouseEnter(btn);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('도시락활성');
    expect(tip).toHaveTextContent('미끼2/2');
    expect(tip).toHaveTextContent('비약활성');
    expect(tip).toHaveTextContent('운세큰그림자');
    expect(within(tip).queryByText('5개 적용 중')).toBeNull();
    expect(within(tip).queryByText('가루디야')).toBeNull();
    expect(within(tip).queryByText('1시간 남음')).toBeNull();

    fireEvent.click(btn);
    expect(onOpenEffects).toHaveBeenCalledTimes(1);
  });

  it('터치 포인터에서는 칩을 눌러도 툴팁이 이중으로 열리지 않고 상세 창 콜백만 실행한다', () => {
    const origMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      const onOpenEffects = vi.fn();
      render(<SlotChips game={{ ...newState(), boat: COOKING_UNLOCK_BOAT }} accountState="account" onOpenEffects={onOpenEffects} />);
      const btn = screen.getByRole('button', { name: '활성 효과 없음' });
      fireEvent.click(btn);
      expect(onOpenEffects).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('tooltip')).toBeNull();
    } finally {
      window.matchMedia = origMatchMedia;
    }
  });
});
