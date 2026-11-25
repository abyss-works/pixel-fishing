import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COOKING_UNLOCK_BOAT } from '../../../../game/content/cooking';
import { newState } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import { gameDayOf } from '../../../../game/rules/time';

const NOW = '2026-11-12T00:00:00.000Z';
vi.mock('../../../../features/gameplay/service/useGameTime', () => ({ useNow: () => NOW }));

import ActiveEffectsModal from './ActiveEffectsModal';

afterEach(cleanup);

const at = (ms: number): string => new Date(Date.parse(NOW) + ms).toISOString();

describe('적용 중인 효과 창 (ActiveEffectsModal)', () => {
  it('적용 중인 효과가 없으면 빈 상태 안내와 가방 열기·전체 보너스 보기 버튼을 보인다', () => {
    const onClose = vi.fn();
    const onOpenBag = vi.fn();
    const onOpenStatsBonus = vi.fn();
    render(
      <ActiveEffectsModal
        game={{ ...newState(), boat: COOKING_UNLOCK_BOAT }}
        onClose={onClose}
        onOpenBag={onOpenBag}
        onOpenStatsBonus={onOpenStatsBonus}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '적용 중인 효과' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('지금 적용 중인 효과가 없어요.')).toBeInTheDocument();
    expect(within(dialog).getByText('가방에서 도시락, 미끼, 비약을 사용해 보세요.')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '가방 열기' }));
    expect(onOpenBag).toHaveBeenCalledTimes(1);

    fireEvent.click(within(dialog).getByRole('button', { name: '전체 보너스 보기' }));
    expect(onOpenStatsBonus).toHaveBeenCalledTimes(1);

    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('도시락(방치)·미끼(수동 2/2)·비약·오늘의 운세 4개 역할 구획과 남은 시간, 곱연산 배수를 보인다', () => {
    const day = gameDayOf(NOW);
    const game: GameState = {
      ...newState(),
      boat: COOKING_UNLOCK_BOAT,
      artifacts: ['sargasso-net'],
      slots: {
        lunch: { id: 'cook-lunch-bite', endsAt: at(102 * 60_000) },
        bait: { id: 'cook-bait-rare', endsAt: at(2 * 60_000) },
        bait2: { id: 'cook-bait-epic', endsAt: at(3 * 60_000) },
      },
      potions: { 'luck-small': day },
      fortune: { day, kind: 'gold', index: 3 },
    };

    render(
      <ActiveEffectsModal
        game={game}
        onClose={vi.fn()}
        onOpenBag={vi.fn()}
        onOpenStatsBonus={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '적용 중인 효과' });
    expect(within(dialog).getByText('도시락')).toBeInTheDocument();
    expect(within(dialog).getByText('방치')).toBeInTheDocument();
    expect(within(dialog).getByText('가루디야')).toBeInTheDocument();
    expect(within(dialog).getByText('1시간 42분 남음')).toBeInTheDocument();

    expect(within(dialog).getByText('미끼')).toBeInTheDocument();
    expect(within(dialog).getByText('2/2')).toBeInTheDocument();
    expect(within(dialog).getByText('수동')).toBeInTheDocument();
    expect(within(dialog).getByText('롱페퍼 미끼')).toBeInTheDocument();
    expect(within(dialog).getByText('큐베브 미끼')).toBeInTheDocument();
    expect(within(dialog).getByText('2분 남음')).toBeInTheDocument();
    expect(within(dialog).getByText('3분 남음')).toBeInTheDocument();

    expect(within(dialog).getByText('비약')).toBeInTheDocument();
    expect(within(dialog).getByText('작은 바다 영약')).toBeInTheDocument();
    expect(within(dialog).getByText('×1.05')).toBeInTheDocument();

    expect(within(dialog).getByText('오늘의 운세')).toBeInTheDocument();
    expect(within(dialog).getByText('재물운')).toBeInTheDocument();
    expect(within(dialog).getByText('판매가')).toBeInTheDocument();
    expect(within(dialog).getByText('×1.03')).toBeInTheDocument();
    expect(within(dialog).getAllByText('하루 동안')).toHaveLength(2);
    expect(within(dialog).queryByText(/%p/i)).toBeNull();
  });
});
