import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { COOKING_UNLOCK_BOAT, recipeById } from '../../../../../game/content/cooking';
import { newState } from '../../../../../game/rules/logic';
import type { GameState } from '../../../../../game/rules/logic';
import { selectItemSection } from '../../../../../features/kitchen/model/bagItems';
import { resetKeyScopes } from '../../../../ui/hotkeys';
import ItemDetail from './ItemDetail';

const NOW = '2026-11-12T00:00:00.000Z';
const HOUR = 3_600_000;
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), boat: COOKING_UNLOCK_BOAT, ...over });

afterEach(() => {
  cleanup();
  resetKeyScopes();
});

describe('ItemDetail', () => {
  it('활성 중인 도시락의 48px 그림, 로어, 수치 효과, 남은 상태, 먹기 버튼을 보이고 하단 닫기 버튼은 두지 않는다', () => {
    const view = selectItemSection(
      seed({
        items: { 'cook-lunch-named': 1 },
        slots: { lunch: { id: 'cook-lunch-named', endsAt: at(6 * HOUR + 12 * 60_000) }, bait: null },
      }),
      NOW,
      'account',
    );
    if (view.state !== 'open') throw new Error('open이어야 해요');
    const row = view.lunch.find(r => r.recipe.id === 'cook-lunch-named')!;
    const onUse = vi.fn();
    const onClose = vi.fn();

    render(
      <ItemDetail
        target={{ kind: 'recipe', row, lockLines: null, onUse }}
        busy={false}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('canvas')).toHaveAttribute('width', '48');
    expect(within(dialog).getByText('암불 티얄')).toBeInTheDocument();
    expect(within(dialog).getByText('도시락')).toBeInTheDocument();
    expect(within(dialog).getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '네임드 만날 확률')).toBeInTheDocument();
    expect(within(dialog).getByText('네임드')).toBeInTheDocument();
    expect(within(dialog).getByText('+50%')).toBeInTheDocument();
    expect(within(dialog).getByText('9시간')).toBeInTheDocument();
    expect(within(dialog).getByText('1개')).toBeInTheDocument();
    expect(within(dialog).getByText('사용 중')).toBeInTheDocument();
    expect(within(dialog).getByText('남음 6시간 12분')).toBeInTheDocument();
    expect(within(dialog).getByText(recipeById('cook-lunch-named')!.description)).toBeInTheDocument();
    expect(within(dialog).getByText(/방치로 낚을 때만 효과가 있어요/)).toBeInTheDocument();

    // 모달 닫기는 우상단 X만 두고 하단 닫기 버튼은 두지 않는다
    expect(within(dialog).getAllByRole('button', { name: '닫기' })).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: '먹기' })).toBeEnabled();

    fireEvent.click(within(dialog).getByRole('button', { name: '먹기' }));
    expect(onUse).toHaveBeenCalledWith(row);

    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('미보유 전설 미끼와 비수치형 달빛 미끼 효과를 깔끔히 렌더링하고 미보유 버튼은 비활성이다', () => {
    const view = selectItemSection(seed({ items: { 'cook-bait-night': 2 } }), NOW, 'account');
    if (view.state !== 'open') throw new Error('open이어야 해요');

    const legendary = view.bait.find(r => r.recipe.id === 'cook-bait-legendary')!;
    render(
      <ItemDetail
        target={{ kind: 'recipe', row: legendary, lockLines: null, onUse: vi.fn() }}
        busy={false}
        onClose={vi.fn()}
      />,
    );
    let dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('용연향 미끼')).toBeInTheDocument();
    expect(within(dialog).getByText('(전설)')).toHaveAttribute('data-rarity', 'legendary');
    expect(within(dialog).getByText('미끼')).toBeInTheDocument();
    expect(within(dialog).getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '전설 어종 출현')).toBeInTheDocument();
    expect(within(dialog).getByText('전설')).toHaveAttribute('data-rarity', 'legendary');
    expect(within(dialog).getByText('+80%')).toBeInTheDocument();
    expect(within(dialog).getByText('0개')).toBeInTheDocument();
    expect(within(dialog).getByText('미보유')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '쓰기' })).toBeDisabled();

    cleanup();
    const night = view.bait.find(r => r.recipe.id === 'cook-bait-night')!;
    render(
      <ItemDetail
        target={{ kind: 'recipe', row: night, lockLines: null, onUse: vi.fn() }}
        busy={false}
        onClose={vi.fn()}
      />,
    );
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('달빛 미끼')).toBeInTheDocument();
    expect(within(dialog).getByText('(특수)')).toHaveAttribute('data-rarity', 'special');
    expect(within(dialog).getByText('낮에도 밤 어종이 함께 낚여요.')).toBeInTheDocument();
    expect(within(dialog).getByText('미적용')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '쓰기' })).toBeEnabled();
  });

  it('물약 상세는 등급색 이름, 행운 효과, 하루 동안 지속, 게스트 잠금 상태를 정확히 보인다', () => {
    const view = selectItemSection(seed({ items: { 'luck-small': 2 } }), NOW, 'guest');
    const potionRow = view.potions[0];

    render(
      <ItemDetail
        target={{ kind: 'potion', row: potionRow, lockLines: view.potionLock, onUse: vi.fn() }}
        busy={false}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('작은 행운 물약')).toBeInTheDocument();
    expect(within(dialog).getByText('(특수)')).toHaveAttribute('data-rarity', 'special');
    expect(within(dialog).getByText('물약')).toBeInTheDocument();
    expect(within(dialog).getByText('모든 행운 효과')).toBeInTheDocument();
    expect(within(dialog).getByText('+5%p')).toBeInTheDocument();
    expect(within(dialog).getByText('하루 동안')).toBeInTheDocument();
    expect(within(dialog).getByText('2개')).toBeInTheDocument();

    const lockGroup = within(dialog).getByRole('group', { name: '작은 행운 물약 사용 잠김' });
    expect(lockGroup).toHaveTextContent('태평양 항로가 열리면 쓸 수 있어요.');
    expect(within(lockGroup).getByRole('button', { name: '사용' })).toBeDisabled();
  });
});
