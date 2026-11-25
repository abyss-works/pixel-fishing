// 가방 아이템 섹션 - 먹기(쓰기)가 eat 액션으로 이어지는지, 효과가 든 슬롯은 확인 창을 거치는지, 해금 전과 게스트는 잠금인지 고정한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { COOKING_UNLOCK_BOAT, ENERGY_ITEM_IDS } from '../../../../../game/content/cooking';
import { newState } from '../../../../../game/rules/logic';
import type { GameState } from '../../../../../game/rules/logic';

const NOW = '2026-11-12T00:00:00.000Z';
vi.mock('../../../../../features/gameplay/service/useGameTime', () => ({ useNow: () => NOW }));

import type { AccountLockState } from '../../../../../features/display/model/menuLock';
import ItemSection from './ItemSection';

afterEach(cleanup);

const HOUR = 3_600_000;
const at = (ms: number): string => new Date(Date.parse(NOW) + ms).toISOString();
const game = (over: Partial<GameState> = {}): GameState => ({ ...newState(), boat: COOKING_UNLOCK_BOAT, ...over });

function show(g: GameState, accountState: AccountLockState = 'account', result: unknown = { status: 'ok', state: g, result: { type: 'none' } }) {
  const dispatch = vi.fn(() => result as never);
  const setToast = vi.fn();
  render(<ItemSection game={g} accountState={accountState} dispatch={dispatch} setToast={setToast} />);
  return { dispatch, setToast };
}

describe('아이템 섹션 목록', () => {
  const own = { 'cook-lunch-bite': 2, 'cook-bait-rare': 4, [ENERGY_ITEM_IDS.common]: 380, [ENERGY_ITEM_IDS.legendary]: 10 };

  it('기운 네 칸의 수와 도시락, 미끼 행을 보인다', () => {
    show(game({ items: own }));
    expect(screen.getByRole('group', { name: '생명의 기운(일반) 38개' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '생명의 기운(희귀) 0개' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '생명의 기운(전설) 1개' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '가루디야 먹기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '롱페퍼 미끼(희귀) 쓰기' })).toBeInTheDocument();
    expect(document.querySelectorAll('canvas').length).toBeGreaterThanOrEqual(6);
  });

  it('도시락과 미끼 카드에 총 지속 시간을 인라인으로 보이고 활성 중인 도시락과 미끼 모두 사용 중 배지와 남은 시간을 보인다', () => {
    const slots = {
      lunch: { id: 'cook-lunch-bite', endsAt: at(8 * HOUR + 42 * 60_000) },
      bait: { id: 'cook-bait-rare', endsAt: at(4 * 60_000 + 18_000) },
    };
    show(game({
      artifacts: ['sargasso-net'],
      items: { 'cook-lunch-bite': 1, 'cook-lunch-rare': 1, 'cook-bait-rare': 1, 'cook-bait-epic': 1 },
      slots,
    }));
    expect(screen.getAllByText('사용 중')).toHaveLength(2);
    expect(document.body.textContent).toContain('지속 9시간');
    expect(document.body.textContent).toContain('남음 8시간 42분');
    expect(document.body.textContent).toContain('지속 2분 30초');
    expect(document.body.textContent).toContain('남음 4분 18초');
  });

  it('기운 칸은 소수 첫째 자리가 0이면 정수로, 아니면 소수로, 천 단위는 쉼표로 쓴다(접근성 이름 포함)', () => {
    show(game({ items: { [ENERGY_ITEM_IDS.common]: 12345, [ENERGY_ITEM_IDS.rare]: 15, [ENERGY_ITEM_IDS.epic]: 5 } }));
    expect(screen.getByRole('group', { name: '생명의 기운(일반) 1,234.5개' })).toHaveTextContent('1,234.5');
    expect(screen.getByRole('group', { name: '생명의 기운(희귀) 1.5개' })).toHaveTextContent('1.5');
    expect(screen.getByRole('group', { name: '생명의 기운(영웅) 0.5개' })).toHaveTextContent('0.5');
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
    const opened = render(<ItemSection game={game({ items: own })} accountState="account" dispatch={vi.fn()} setToast={vi.fn()} />);
    const openedOrder = order(opened.container);
    cleanup();
    const locked = render(<ItemSection game={game({ boat: COOKING_UNLOCK_BOAT - 1 })} accountState="account" dispatch={vi.fn()} setToast={vi.fn()} />);
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
    fireEvent.click(screen.getByRole('button', { name: '사프란 미끼(특수) 쓰기' }));
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
    const { setToast } = show(game({ items: own }), 'account', { status: 'rejected', error: 'item-not-owned' });
    fireEvent.click(screen.getByRole('button', { name: '사프란 미끼(특수) 쓰기' }));
    await vi.waitFor(() => expect(setToast).toHaveBeenCalledWith('가방에 이 요리가 없어요.', 'warn'));
  });

  it('다중 미끼 유물 — 사용 중 배지, 빈 두 번째 칸 무확인 적용, 중복 갱신 2분 30초, 세 번째 미끼 교체 슬롯 선택', () => {
    const items = { 'cook-bait-rare': 1, 'cook-bait-epic': 1, 'cook-bait-legendary': 1 };
    const oneActive = game({
      artifacts: ['sargasso-net'],
      items,
      slots: { lunch: null, bait: { id: 'cook-bait-rare', endsAt: at(120_000) } },
    });
    const { dispatch: d1 } = show(oneActive);
    expect(screen.getAllByText('사용 중')).toHaveLength(1);
    // 2번째 다른 미끼는 확인 없이 바로 장착
    fireEvent.click(screen.getByRole('button', { name: '큐베브 미끼(영웅) 쓰기' }));
    expect(d1).toHaveBeenCalledWith({ type: 'eat', item: 'cook-bait-epic' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // 중복 미끼는 확인 창을 띄우고 새로 2분 30초를 보인다
    fireEvent.click(screen.getByRole('button', { name: '롱페퍼 미끼(희귀) 쓰기' }));
    const dupDialog = screen.getByRole('dialog');
    expect(within(dupDialog).getByText('2분 30초')).toBeInTheDocument();
    fireEvent.click(within(dupDialog).getByRole('button', { name: '쓰기' }));
    expect(d1).toHaveBeenCalledWith({ type: 'eat', item: 'cook-bait-rare' });

    cleanup();
    const bothActive = game({
      artifacts: ['sargasso-net'],
      items,
      slots: {
        lunch: null,
        bait: { id: 'cook-bait-rare', endsAt: at(150_000) },
        bait2: { id: 'cook-bait-epic', endsAt: at(60_000) },
      },
    });
    const { dispatch: d2 } = show(bothActive);
    expect(screen.getAllByText('사용 중')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '용연향 미끼(전설) 쓰기' }));
    const dialog = screen.getByRole('dialog');
    const radios = within(dialog).getAllByRole('radio');
    expect(radios).toHaveLength(2);
    // 먼저 끝나는 bait2가 기본 선택된다
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    // 첫 번째 미끼(bait)로 바꿔 선택하고 확정
    fireEvent.click(radios[0]);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getByText('2분 30초')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '쓰기' }));
    expect(d2).toHaveBeenCalledWith({ type: 'eat', item: 'cook-bait-legendary', replaceSlot: 'bait' });
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
    show(game(), 'guest');
    expect(screen.getByText('가진 아이템이 없어요.').parentElement!.children).toHaveLength(1);
    expect(screen.getByRole('group', { name: '도시락, 미끼, 생명의 기운' })).toHaveTextContent('태평양 항로가 열리면 쓸 수 있어요.');
  });
});
