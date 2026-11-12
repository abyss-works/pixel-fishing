// 가방 아이템 섹션 - 먹기(쓰기)가 eat 액션으로 이어지는지, 효과가 든 슬롯은 확인 창을 거치는지, 해금 전과 게스트는 잠금인지 고정한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { COOKING_UNLOCK_BOAT, ENERGY_ITEM_IDS } from '../../../../../game/content/cooking';
import { newState } from '../../../../../game/rules/logic';
import type { GameState } from '../../../../../game/rules/logic';

const NOW = '2026-11-12T00:00:00.000Z';
vi.mock('../../../../../features/gameplay/service/useGameTime', () => ({ useNow: () => NOW }));

import ItemSection from './ItemSection';

afterEach(cleanup);

const HOUR = 3_600_000;
const at = (ms: number): string => new Date(Date.parse(NOW) + ms).toISOString();
const game = (over: Partial<GameState> = {}): GameState => ({ ...newState(), boat: COOKING_UNLOCK_BOAT, ...over });

function show(g: GameState, guest = false, result: unknown = { status: 'ok', state: g, result: { type: 'none' } }) {
  const dispatch = vi.fn(() => result as never);
  const setToast = vi.fn();
  render(<ItemSection game={g} guest={guest} dispatch={dispatch} setToast={setToast} />);
  return { dispatch, setToast };
}

describe('아이템 섹션 목록', () => {
  const own = { 'cook-lunch-bite': 2, 'cook-bait-rare': 4, [ENERGY_ITEM_IDS.common]: 38, [ENERGY_ITEM_IDS.legendary]: 1 };

  it('기운 네 칸의 수와 도시락, 미끼 행을 보인다', () => {
    show(game({ items: own }));
    expect(screen.getByRole('group', { name: '생명의 기운(일반) 38개' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '생명의 기운(희귀) 0개' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '생명의 기운(전설) 1개' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '가루디야 먹기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '롱페퍼 미끼(희귀) 쓰기' })).toBeInTheDocument();
  });

  it('가진 것이 없으면 안내 한 줄만 보인다', () => {
    show(game());
    expect(screen.getByText('가진 아이템이 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('묶음 순서', () => {
  // 소제목은 모두 점선 툴팁이거나 글자이고, 섹션 본문에서 이 이름들이 나타나는 순서가 곧 묶음 순서다
  const order = (container: HTMLElement): string[] => {
    const text = container.textContent ?? '';
    return ['도시락', '미끼', '생명의 기운'].map(n => [n, text.indexOf(n)] as const)
      .filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([n]) => n);
  };

  it('해금 전 잠금 자리와 해금 뒤 섹션은 도시락, 미끼, 생명의 기운 순서로 같다', () => {
    const own = { 'cook-lunch-bite': 1, 'cook-bait-rare': 1, [ENERGY_ITEM_IDS.common]: 1 };
    const opened = render(<ItemSection game={game({ items: own })} guest={false} dispatch={vi.fn()} setToast={vi.fn()} />);
    const openedOrder = order(opened.container);
    cleanup();
    const locked = render(<ItemSection game={game({ boat: COOKING_UNLOCK_BOAT - 1 })} guest={false} dispatch={vi.fn()} setToast={vi.fn()} />);
    // 잠금 상태의 빈 안내 문장에 도시락, 미끼 말이 앞서 나오므로 잠금 자리(그룹) 안에서만 센다
    const group = within(locked.container).getByRole('group', { name: '도시락, 미끼, 생명의 기운' });
    expect(order(group)).toEqual(['도시락', '미끼', '생명의 기운']);
    expect(openedOrder).toEqual(['도시락', '미끼', '생명의 기운']);
  });
});

describe('먹기와 쓰기', () => {
  const own = { 'cook-lunch-bite': 1, 'cook-lunch-rare': 1, 'cook-bait-mutation': 1 };

  it('슬롯이 비어 있으면 확인 없이 eat 액션을 보낸다', () => {
    const { dispatch } = show(game({ items: own }));
    fireEvent.click(screen.getByRole('button', { name: '사프란 미끼 쓰기' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'eat', item: 'cook-bait-mutation' });
    expect(screen.queryByText('미끼 바꾸기')).not.toBeInTheDocument();
  });

  it('효과가 든 슬롯에는 교체 확인 창이 먼저 뜨고 확인해야 eat 액션을 보낸다', () => {
    const slots = { lunch: { id: 'cook-lunch-bite', endsAt: at(8 * HOUR + 12 * 60_000) }, bait: null };
    const { dispatch } = show(game({ items: own, slots }));
    fireEvent.click(screen.getByRole('button', { name: '민 몰리 먹기' }));
    expect(dispatch).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('도시락 바꾸기')).toBeInTheDocument();
    expect(within(dialog).getByText('8시간 12분')).toBeInTheDocument();
    expect(within(dialog).getByText('9시간')).toBeInTheDocument();
    expect(within(dialog).getByText('지금 효과의 남은 시간은 사라져요.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '먹기' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'eat', item: 'cook-lunch-rare' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('같은 것을 다시 먹어도 교체 확인 창을 거친다', () => {
    const slots = { lunch: { id: 'cook-lunch-bite', endsAt: at(HOUR) }, bait: null };
    const { dispatch } = show(game({ items: own, slots }));
    fireEvent.click(screen.getByRole('button', { name: '가루디야 먹기' }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByText('도시락 바꾸기')).toBeInTheDocument();
  });

  it('확인 창의 닫기는 취소라 액션을 보내지 않는다', () => {
    const slots = { lunch: { id: 'cook-lunch-bite', endsAt: at(HOUR) }, bait: null };
    const { dispatch } = show(game({ items: own, slots }));
    fireEvent.click(screen.getByRole('button', { name: '민 몰리 먹기' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('서버가 거부하면 거부 문구를 경고로 알린다', async () => {
    const { setToast } = show(game({ items: own }), false, { status: 'rejected', error: 'item-not-owned' });
    fireEvent.click(screen.getByRole('button', { name: '사프란 미끼 쓰기' }));
    await vi.waitFor(() => expect(setToast).toHaveBeenCalledWith('가방에 이 요리가 없어요.', 'warn'));
  });
});

describe('해금 전과 게스트', () => {
  it('해금 전 계정 사용자는 빈 상태 세 줄과 잠금 자리를 본다', () => {
    show(game({ boat: COOKING_UNLOCK_BOAT - 1 }));
    const note = screen.getByText('가진 아이템이 없어요.').parentElement!;
    expect([...note.children].map(el => el.textContent)).toEqual([
      '가진 아이템이 없어요.',
      '인도양 항로가 열리면 부엌에서 도시락과 미끼를 만들 수 있어요.',
      '인도양 항로는 증기선(5단계)부터 열려요.',
    ]);
    expect(screen.getByRole('group', { name: '도시락, 미끼, 생명의 기운' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /먹기|쓰기/ })).not.toBeInTheDocument();
  });

  it('게스트는 한 줄 빈 상태이고 잠금 줄이 게스트 잠금이다', () => {
    show(game(), true);
    expect(screen.getByText('가진 아이템이 없어요.').parentElement!.children).toHaveLength(1);
    expect(screen.getByRole('group', { name: '도시락, 미끼, 생명의 기운' })).toHaveTextContent('계정을 연결하면 쓸 수 있어요.');
  });
});
