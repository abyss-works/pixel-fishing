import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { COOKING_UNLOCK_BOAT } from '../../../game/content/cooking';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { gameDayOf } from '../../../game/rules/time';

const NOW = '2026-11-12T00:00:00.000Z';
vi.mock('../../../features/gameplay/service/useGameTime', () => ({ useNow: () => NOW }));

import EffectCard from './EffectCard';

afterEach(cleanup);

const at = (ms: number): string => new Date(Date.parse(NOW) + ms).toISOString();

describe('EffectCard (적용 중인 효과 카드)', () => {
  it('요리가 열리기 전이고 활성 효과도 없으면 잠금 카드를 보이고 부엌 해금 조건을 툴팁으로 알린다', () => {
    render(<EffectCard game={{ ...newState(), boat: COOKING_UNLOCK_BOAT - 1 }} accountState="account" />);
    const group = screen.getByRole('group', { name: '적용 중인 효과 잠김' });
    expect(group.querySelector('[data-glyph="lock"]')).not.toBeNull();
    fireEvent.mouseEnter(group.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('인도양 항로가 열리면 부엌에서 도시락과 미끼를 만들 수 있어요.');
  });

  it('요리가 열린 뒤 활성 효과가 없으면 누를 수 있는 흐린 카드이고 호버 요약은 없다', () => {
    const onOpenEffects = vi.fn();
    render(<EffectCard game={{ ...newState(), boat: COOKING_UNLOCK_BOAT }} accountState="account" onOpenEffects={onOpenEffects} />);
    const btn = screen.getByRole('button', { name: '적용 중인 효과 없음' });
    fireEvent.mouseEnter(btn);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(btn);
    expect(onOpenEffects).toHaveBeenCalledTimes(1);
  });

  it('활성 효과는 한 카드에 도시락, 미끼, 비약, 운세 순서로 모이고 도시락과 미끼만 막대를 갖는다', () => {
    const onOpenEffects = vi.fn();
    const day = gameDayOf(NOW);
    const game: GameState = {
      ...newState(), boat: COOKING_UNLOCK_BOAT,
      slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(100 * 3_600_000) }, bait: { id: 'cook-bait-rare', endsAt: at(60_000) } },
      potions: { 'luck-small': day }, fortune: { day, kind: 'fish', index: 5 },
    };
    render(<EffectCard game={game} accountState="account" onOpenEffects={onOpenEffects} />);
    const card = screen.getByRole('button', { name: '적용 중인 효과 4개' });
    expect([...card.children].map(el => el.getAttribute('data-effect-kind'))).toEqual(['lunch', 'bait', 'potion', 'fortune']);
    const meters = screen.getAllByRole('meter');
    expect(meters).toHaveLength(2);
    expect(meters[0]).toHaveAttribute('aria-valuenow', '1');
    fireEvent.mouseEnter(card);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(card);
    expect(onOpenEffects).toHaveBeenCalledTimes(1);
  });
});
