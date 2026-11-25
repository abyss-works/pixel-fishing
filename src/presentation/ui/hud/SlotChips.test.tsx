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
    expect(tip).toHaveTextContent('인도양 항로가 열리면 도시락과 미끼를 쓸 수 있어요.');
  });

  it('요리가 열린 뒤 활성 효과가 없으면 네모 점과 흐린 효과 0을 보이고, 툴팁에 없음 안내를 연다', () => {
    render(<SlotChips game={{ ...newState(), boat: COOKING_UNLOCK_BOAT }} accountState="account" />);
    const group = screen.getByRole('group', { name: '활성 효과 없음' });
    expect(group).toHaveTextContent('효과0');
    expect(group.className).toContain('text-text-dim');
    const dot = group.querySelector('span[aria-hidden="true"]')!;
    expect(dot.className).toContain('size-1.5');
    expect(dot.className).not.toContain('rounded-full');

    fireEvent.mouseEnter(group);
    const tip = screen.getByRole('tooltip');
    expect(within(tip).getByText('없음')).toBeInTheDocument();
    expect(tip).toHaveTextContent('적용 중인 요리나 물약, 운세가 없어요.');
  });

  it('도시락, 다중 미끼, 물약, 오늘의 운세가 모두 켜져도 React key 중복 경고 없이 한 칩에 활성 수를 모으고 툴팁에 등급색과 남은 시간을 보인다', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
    render(<SlotChips game={game} accountState="account" />);
    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveAttribute('aria-label', '활성 효과 5개');
    expect(groups[0]).toHaveTextContent('효과5');
    expect(groups[0].className).toContain('border-accent');
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();

    fireEvent.mouseEnter(groups[0]);
    const tip = screen.getByRole('tooltip');
    expect(within(tip).getByText('5개 적용 중')).toBeInTheDocument();
    expect(within(tip).getByText('가루디야')).toBeInTheDocument();
    expect(within(tip).getByText('롱페퍼 미끼')).toBeInTheDocument();
    expect(within(tip).getByText('(희귀)')).toHaveAttribute('data-rarity', 'rare');
    expect(within(tip).getByText('큐베브 미끼')).toBeInTheDocument();
    expect(within(tip).getByText('(영웅)')).toHaveAttribute('data-rarity', 'epic');
    expect(within(tip).getByText('작은 행운 물약')).toBeInTheDocument();
    expect(within(tip).getByText('(특수)')).toHaveAttribute('data-rarity', 'special');
    expect(within(tip).getByText('오늘의 운세')).toBeInTheDocument();
    expect(within(tip).getByText('그림자 운')).toBeInTheDocument();
    expect(within(tip).getByText('네임드')).toHaveClass('text-epic');
    expect(within(tip).getByText('1시간 남음')).toBeInTheDocument();
    expect(within(tip).getByText('3분 남음')).toBeInTheDocument();
    expect(within(tip).getAllByText('하루 동안')).toHaveLength(2);
  });
});
