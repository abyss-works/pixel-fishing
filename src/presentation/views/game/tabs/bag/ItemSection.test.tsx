// 가방 아이템 섹션 - 먹기(쓰기)가 eat 액션으로 이어지는지, 효과가 든 슬롯은 확인 창을 거치는지, 해금 전과 게스트는 잠금인지 고정한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { COOKING_UNLOCK_BOAT, ENERGY_ITEM_IDS } from '../../../../../game/content/cooking';
import { newState } from '../../../../../game/rules/logic';
import type { GameState } from '../../../../../game/rules/logic';

const NOW = '2026-11-12T00:00:00.000Z';
vi.mock('../../../../../features/gameplay/service/useGameTime', () => ({ useNow: () => NOW }));

import type { AccountLockState } from '../../../../../features/display/model/menuLock';
import { resetKeyScopes } from '../../../../ui/hotkeys';
import ItemSection from './ItemSection';

afterEach(() => {
  cleanup();
  resetKeyScopes();
});

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
    expect(screen.getByRole('button', { name: '가루디야(일반) 사용' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '롱페퍼 미끼(희귀) 사용' })).toBeInTheDocument();
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
    const useButton = screen.getByRole('button', { name: '가루디야(일반) 사용' });
    expect(within(useButton.parentElement!).getByText('사용 중')).toBeInTheDocument();
    expect(within(useButton.parentElement!).queryByText(/남음/)).toBeNull();
    const card = useButton.closest('.pf-notch') as HTMLElement;
    expect(within(card).getByText('남음 8시간 42분')).toBeInTheDocument();
    expect(document.body.textContent).toContain('지속 9시간');
    expect(document.body.textContent).toContain('지속 2분 30초');
    expect(document.body.textContent).toContain('남음 4분');
  });

  it('기운 칸은 소수 첫째 자리가 0이면 정수로, 아니면 소수로, 천 단위는 쉼표로 쓴다(접근성 이름 포함)', () => {
    show(game({ items: { [ENERGY_ITEM_IDS.common]: 12345, [ENERGY_ITEM_IDS.rare]: 15, [ENERGY_ITEM_IDS.epic]: 5 } }));
    expect(screen.getByRole('group', { name: '생명의 기운(일반) 1,234.5개' })).toHaveTextContent('1,234.5');
    expect(screen.getByRole('group', { name: '생명의 기운(희귀) 1.5개' })).toHaveTextContent('1.5');
    expect(screen.getByRole('group', { name: '생명의 기운(영웅) 0.5개' })).toHaveTextContent('0.5');
  });

  it('부엌 해금 후에는 보유 중만 보기 기본 꺼짐으로 도시락 6종·미끼 6종·기운 4종 전체를 보이고, 미보유 카드는 비활성이다', () => {
    const { dispatch } = show(game());
    expect(screen.getByRole('button', { name: '보유 중만 보기' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('group', { name: '생명의 기운(일반) 0개' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '생명의 기운(전설) 0개' })).toBeInTheDocument();
    const lunchBtn = screen.getByRole('button', { name: '가루디야(일반) 사용' });
    expect(lunchBtn).toBeDisabled();
    fireEvent.click(lunchBtn);
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('사용 중')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사프란 미끼(특수) 사용' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /\)\s사용$/ })).toHaveLength(12);
    expect(screen.queryByText('가진 아이템이 없어요.')).not.toBeInTheDocument();
  });

  it('보유 중만 보기 토글을 켜면 보유하거나 적용 중인 항목만 남기고, 없으면 빈 안내를 보인다', () => {
    show(game({
      items: { 'cook-lunch-rare': 2, [ENERGY_ITEM_IDS.epic]: 10 },
      slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(HOUR) }, bait: null },
    }));
    const toggle = screen.getByRole('button', { name: '보유 중만 보기' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    // 수량 0이어도 적용 중인 가루디야와 보유 중인 민 몰리만 남는다
    expect(screen.getByRole('button', { name: '가루디야(일반) 사용' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '민 몰리(희귀) 사용' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '생선 비리야니(영웅) 사용' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /미끼.*사용$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '생명의 기운(영웅) 1개' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '생명의 기운(일반) 0개' })).not.toBeInTheDocument();

    cleanup();
    show(game());
    fireEvent.click(screen.getByRole('button', { name: '보유 중만 보기' }));
    expect(screen.getByText('가진 아이템이 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /사용$/ })).not.toBeInTheDocument();
  });

  it('도시락과 미끼 주의사항은 각 카드가 아니라 묶음 소제목 툴팁 한 곳에만 있고 카드 클릭으로 상세 창을 연다', () => {
    show(game({ items: own }));

    // 카드에 마우스를 올리면 효과 툴팁이 뜬다
    fireEvent.mouseEnter(screen.getAllByText('가루디야')[0]);
    const cardTip = screen.getByRole('tooltip');
    expect(cardTip).toHaveTextContent('입질 대기');
    expect(cardTip).toHaveTextContent('−10%');
    expect(cardTip).not.toHaveTextContent('방치로 낚을 때만 효과가 있어요.');
    fireEvent.mouseLeave(screen.getAllByText('가루디야')[0]);

    // 도시락·미끼 소제목 툴팁 한 곳에 공통 주의사항이 집약돼 있다
    fireEvent.mouseEnter(screen.getByText('도시락'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('방치로 낚을 때만 효과가 있어요.');
    fireEvent.mouseLeave(screen.getByText('도시락'));

    fireEvent.mouseEnter(screen.getByText('미끼'));
    const baitTip = screen.getByRole('tooltip');
    expect(baitTip).toHaveTextContent('직접 챔질해 낚을 때만 효과가 있어요.');
    expect(baitTip).toHaveTextContent('접속하지 않아도 지속 시간이 흘러요.');
    fireEvent.mouseLeave(screen.getByText('미끼'));

    // 카드 본문을 누르면 상세 창이 열린다 (상세 창에는 주의사항이 보인다)
    fireEvent.click(screen.getByRole('button', { name: '가루디야(일반) 상세 보기' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('입질 대기')).toBeInTheDocument();
    expect(within(dialog).getByText('−10%')).toBeInTheDocument();
    expect(within(dialog).getByText('방치로 낚을 때만 효과가 있어요.')).toBeInTheDocument();
    expect(within(dialog).getByText('접속하지 않아도 지속 시간이 흘러요.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('비약은 배 해금 전 계정에서도 열려 있고, 카드 호버 시 효과 툴팁·클릭 시 상세를 보며 사용하면 usePotion 액션과 안내를 보낸다', () => {
    const { dispatch, setToast } = show(game({ boat: 0, items: { 'luck-small': 2 } }));
    const potionName = screen.getByText('작은 바다 영약');
    expect(potionName).toBeInTheDocument();
    expect(within(potionName.parentElement!).getByText('(특수)')).toHaveAttribute('data-rarity', 'special');
    expect(screen.getByText('하루 동안')).toBeInTheDocument();
    expect(screen.getByText('×2')).toBeInTheDocument();

    fireEvent.mouseEnter(potionName);
    const potionTip = screen.getByRole('tooltip');
    expect(potionTip).toHaveTextContent('모든 행운 효과');
    expect(potionTip).toHaveTextContent('×1.05');
    fireEvent.mouseLeave(potionName);

    fireEvent.click(screen.getByRole('button', { name: '작은 바다 영약 상세 보기' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('모든 행운 효과')).toBeInTheDocument();
    expect(within(dialog).getByText('×1.05')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const btn = screen.getByRole('button', { name: '작은 바다 영약 사용' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(dispatch).toHaveBeenCalledWith({ type: 'usePotion', id: 'luck-small' });
    expect(setToast).toHaveBeenCalledWith('작은 바다 영약을 사용했어요. 하루 동안 이어져요.');
  });

  it('비약은 이미 사용 중이면 사용 중 배지와 비활성 사용 버튼이 분리되고, 미보유면 사용 버튼이 비활성이다', () => {
    show(game({ items: { 'luck-small': 1 }, potions: { 'luck-small': '2026-11-12' } }));
    const activeBtn = screen.getByRole('button', { name: '작은 바다 영약 사용' });
    expect(activeBtn).toBeDisabled();
    expect(activeBtn).toHaveTextContent(/^사용$/);
    expect(within(activeBtn.parentElement!).getByText('사용 중')).toBeInTheDocument();

    cleanup();
    show(game({ items: {} }));
    const emptyBtn = screen.getByRole('button', { name: '작은 바다 영약 사용' });
    expect(emptyBtn).toBeDisabled();
    expect(screen.queryByText('사용 중')).toBeNull();

    // 보유 중만 보기에서 수량 0이어도 오늘 사용 중이면 남는다
    cleanup();
    show(game({ items: {}, potions: { 'luck-small': '2026-11-12' } }));
    fireEvent.click(screen.getByRole('button', { name: '보유 중만 보기' }));
    const filteredBtn = screen.getByRole('button', { name: '작은 바다 영약 사용' });
    expect(filteredBtn).toBeDisabled();
    expect(within(filteredBtn.parentElement!).getByText('사용 중')).toBeInTheDocument();
  });

  it('게스트는 보유한 비약 카드 사용 버튼과 상세 창 안의 사용 버튼이 모두 열려 있고, 확인 실패는 잠겨 있다', () => {
    const { dispatch } = show(game({ boat: 0, items: { 'luck-small': 2 } }), 'guest');
    expect(screen.queryByRole('group', { name: '작은 바다 영약 잠김' })).toBeNull();
    const cardBtn = screen.getByRole('button', { name: '작은 바다 영약 사용' });
    expect(cardBtn).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '작은 바다 영약 상세 보기' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('group', { name: '작은 바다 영약 사용 잠김' })).toBeNull();
    const detailBtn = within(dialog).getByRole('button', { name: '사용' });
    expect(detailBtn).toBeEnabled();
    fireEvent.click(detailBtn);
    expect(dispatch).toHaveBeenCalledWith({ type: 'usePotion', id: 'luck-small' });
    cleanup();

    show(game({ items: { 'luck-small': 2 } }), 'unverified');
    const lockGroup = screen.getByRole('group', { name: '작은 바다 영약 잠김' });
    expect(lockGroup).toHaveTextContent('계정을 확인하면 쓸 수 있어요.');
    expect(within(lockGroup).getByRole('button', { name: '작은 바다 영약 사용' })).toBeDisabled();
  });
});

describe('묶음 순서 및 기운 격자', () => {
  // 소제목은 모두 Subheading(h5)이며, 그 나타나는 순서가 곧 묶음 순서다
  const order = (container: HTMLElement): string[] =>
    [...container.querySelectorAll('h5')].map(el => el.textContent?.trim() ?? '').filter(Boolean);

  it('해금 전 잠금 자리와 해금 뒤 섹션은 생명의 기운, 도시락, 미끼, 비약 순서로 같다', () => {
    const own = { 'cook-lunch-bite': 1, 'cook-bait-rare': 1, [ENERGY_ITEM_IDS.common]: 1 };
    const opened = render(<ItemSection game={game({ items: own })} accountState="account" dispatch={vi.fn()} setToast={vi.fn()} />);
    const openedOrder = order(opened.container);
    const energyCell = screen.getByRole('group', { name: /생명의 기운\(일반\)/ });
    expect(energyCell.parentElement?.className).toContain('grid-cols-4');
    cleanup();
    const locked = render(<ItemSection game={game({ boat: COOKING_UNLOCK_BOAT - 1 })} accountState="account" dispatch={vi.fn()} setToast={vi.fn()} />);
    const lockedOrder = order(locked.container);
    expect(lockedOrder).toEqual(['생명의 기운', '도시락', '미끼', '비약']);
    expect(openedOrder).toEqual(['생명의 기운', '도시락', '미끼', '비약']);
  });
});

describe('아이템 사용과 교체', () => {
  const own = { 'cook-lunch-bite': 1, 'cook-lunch-rare': 1, 'cook-bait-mutation': 1 };

  it('슬롯이 비어 있으면 확인 없이 eat 액션을 보내고 조사에 맞는 사용 안내를 알린다', () => {
    const { dispatch, setToast } = show(game({ items: own }));
    fireEvent.click(screen.getByRole('button', { name: '사프란 미끼(특수) 사용' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'eat', item: 'cook-bait-mutation' });
    expect(setToast).toHaveBeenCalledWith('사프란 미끼(특수)를 사용했어요.');
    expect(screen.queryByText('미끼 바꾸기')).not.toBeInTheDocument();
  });

  it('효과가 든 슬롯에는 교체 확인 창이 먼저 뜨고 확인해야 eat 액션을 보낸다', () => {
    const slots = { lunch: { id: 'cook-lunch-bite', endsAt: at(8 * HOUR + 12 * 60_000) }, bait: null };
    const { dispatch } = show(game({ items: own, slots }));
    fireEvent.click(screen.getByRole('button', { name: '민 몰리(희귀) 사용' }));
    expect(dispatch).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('도시락 바꾸기')).toBeInTheDocument();
    expect(within(dialog).getByText('8시간 12분')).toBeInTheDocument();
    expect(within(dialog).getByText('9시간')).toBeInTheDocument();
    expect(within(dialog).getByText('지금 효과의 남은 시간은 사라져요.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '사용' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'eat', item: 'cook-lunch-rare' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('같은 것을 다시 사용해도 교체 확인 창을 거친다', () => {
    const slots = { lunch: { id: 'cook-lunch-bite', endsAt: at(HOUR) }, bait: null };
    const { dispatch } = show(game({ items: own, slots }));
    fireEvent.click(screen.getByRole('button', { name: '가루디야(일반) 사용' }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByText('도시락 바꾸기')).toBeInTheDocument();
  });

  it('확인 창의 닫기는 취소라 액션을 보내지 않는다', () => {
    const slots = { lunch: { id: 'cook-lunch-bite', endsAt: at(HOUR) }, bait: null };
    const { dispatch } = show(game({ items: own, slots }));
    fireEvent.click(screen.getByRole('button', { name: '민 몰리(희귀) 사용' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('서버가 거부하면 거부 문구를 경고로 알린다', async () => {
    const { setToast } = show(game({ items: own }), 'account', { status: 'rejected', error: 'item-not-owned' });
    fireEvent.click(screen.getByRole('button', { name: '사프란 미끼(특수) 사용' }));
    await vi.waitFor(() => expect(setToast).toHaveBeenCalledWith('가방에 이 요리가 없어요.', 'warn'));
  });

  it('다중 미끼 유물 — 사용 중 배지, 빈 두 번째 칸 무확인 적용, 중복 갱신 분 표기, 세 번째 미끼 교체 슬롯 선택', () => {
    const items = { 'cook-bait-rare': 1, 'cook-bait-epic': 1, 'cook-bait-legendary': 1 };
    const oneActive = game({
      artifacts: ['sargasso-net'],
      items,
      slots: { lunch: null, bait: { id: 'cook-bait-rare', endsAt: at(120_000) } },
    });
    const { dispatch: d1 } = show(oneActive);
    expect(screen.getAllByText('사용 중')).toHaveLength(1);
    // 2번째 다른 미끼는 확인 없이 바로 장착
    fireEvent.click(screen.getByRole('button', { name: '큐베브 미끼(영웅) 사용' }));
    expect(d1).toHaveBeenCalledWith({ type: 'eat', item: 'cook-bait-epic' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // 중복 미끼는 확인 창을 띄우고 현재 남은 시간은 분까지만, 새로 넣을 지속 시간은 2분 30초로 보인다
    fireEvent.click(screen.getByRole('button', { name: '롱페퍼 미끼(희귀) 사용' }));
    const dupDialog = screen.getByRole('dialog');
    expect(within(dupDialog).getByText('2분')).toBeInTheDocument();
    expect(within(dupDialog).getByText('2분 30초')).toBeInTheDocument();
    fireEvent.click(within(dupDialog).getByRole('button', { name: '사용' }));
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
    fireEvent.click(screen.getByRole('button', { name: '용연향 미끼(전설) 사용' }));
    const dialog = screen.getByRole('dialog');
    const radios = within(dialog).getAllByRole('radio');
    expect(radios).toHaveLength(2);
    // 먼저 끝나는 bait2가 기본 선택된다
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    // 첫 번째 미끼(bait)로 바꿔 선택하고 확정
    fireEvent.click(radios[0]);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getByText('2분')).toBeInTheDocument();
    expect(within(dialog).getByText('2분 30초')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '사용' }));
    expect(d2).toHaveBeenCalledWith({ type: 'eat', item: 'cook-bait-legendary', replaceSlot: 'bait' });
  });
});

describe('해금 전과 게스트', () => {
  it('해금 전 계정 사용자는 전체 보기에서 1줄 안내만 보이고 보유 중만 보기에서 빈 안내를 보며, 보유한 도시락·미끼는 잠금 없이 즉시 사용할 수 있다', () => {
    show(game({ boat: COOKING_UNLOCK_BOAT - 1 }));
    expect(screen.queryByText('가진 아이템이 없어요.')).not.toBeInTheDocument();
    expect(screen.getByText('인도양 항로가 열리면 부엌을 쓸 수 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보유 중만 보기' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByRole('button', { name: /\)\s사용$/ })).toHaveLength(12);
    expect(screen.getByRole('button', { name: '가루디야(일반) 사용' })).toBeDisabled();
    expect(screen.getByRole('group', { name: '생명의 기운 잠김' })).toHaveTextContent('인도양 항로가 열리면 부엌을 쓸 수 있어요.');

    // 보유 중만 보기를 켜면 미보유 플레이스홀더를 숨기고 빈 안내만 남긴다
    fireEvent.click(screen.getByRole('button', { name: '보유 중만 보기' }));
    expect(screen.getByText('가진 아이템이 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\)\s사용$/ })).not.toBeInTheDocument();

    cleanup();
    const { dispatch } = show(game({
      boat: COOKING_UNLOCK_BOAT - 1,
      items: { 'cook-lunch-bundle': 1, 'cook-bait-legendary': 3 },
    }));
    expect(screen.getByRole('group', { name: '생명의 기운 잠김' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '가루디야(일반) 잠김' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '생선 탈리(전설) 잠김' })).toBeNull();
    expect(screen.queryByRole('group', { name: '용연향 미끼(전설) 잠김' })).toBeNull();

    const lunchBtn = screen.getByRole('button', { name: '생선 탈리(전설) 사용' });
    expect(lunchBtn).toBeEnabled();
    fireEvent.click(lunchBtn);
    expect(dispatch).toHaveBeenCalledWith({ type: 'eat', item: 'cook-lunch-bundle' });

    fireEvent.click(screen.getByRole('button', { name: '용연향 미끼(전설) 상세 보기' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('group', { name: '용연향 미끼(전설) 사용 잠김' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: '사용' })).toBeEnabled();
  });

  it('게스트는 해금 전에는 미보유 항목만 진행 조건 잠금이고 보유한 도시락·미끼는 상세와 카드 모두에서 사용할 수 있다', () => {
    const { dispatch } = show(game({ boat: COOKING_UNLOCK_BOAT - 1, items: { 'cook-lunch-bundle': 1 } }), 'guest');
    expect(screen.queryByText('가진 아이템이 없어요.')).not.toBeInTheDocument();
    expect(screen.getByText('인도양 항로가 열리면 부엌을 쓸 수 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보유 중만 보기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '가루디야(일반) 사용' })).toBeDisabled();
    expect(screen.getByRole('group', { name: '생명의 기운 잠김' })).toHaveTextContent('인도양 항로가 열리면 부엌을 쓸 수 있어요.');
    expect(screen.queryByRole('group', { name: '생선 탈리(전설) 잠김' })).toBeNull();
    const ownedLunchBtn = screen.getByRole('button', { name: '생선 탈리(전설) 사용' });
    expect(ownedLunchBtn).toBeEnabled();
    fireEvent.click(ownedLunchBtn);
    expect(dispatch).toHaveBeenCalledWith({ type: 'eat', item: 'cook-lunch-bundle' });

    fireEvent.click(screen.getByRole('button', { name: '생선 탈리(전설) 상세 보기' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('group', { name: '생선 탈리(전설) 사용 잠김' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: '사용' })).toBeEnabled();
    cleanup();

    show(game({ items: { 'cook-lunch-bundle': 1 } }), 'guest');
    expect(screen.queryByText('가진 아이템이 없어요.')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '생명의 기운 잠김' })).toHaveTextContent('태평양 항로가 열리면 쓸 수 있어요.');
    expect(screen.getByRole('group', { name: '가루디야(일반) 잠김' })).toHaveTextContent('태평양 항로가 열리면 쓸 수 있어요.');
    expect(screen.queryByRole('group', { name: '생선 탈리(전설) 잠김' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '보유 중만 보기' }));
    expect(screen.getByRole('button', { name: '생선 탈리(전설) 사용' })).toBeEnabled();
  });
});
