// 부엌 창 — 고정 정보 줄(조리 중·대기열·보관함), 탭 3개(도시락·미끼·기운 변환), 대기열 취소 확인, 레시피 조리 및 기운 변환.
// 조리·취소·변환 가능 여부는 게임 규칙이 정하고, 이 테스트는 판정과 상태가 화면에 그대로 닿는지 본다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { itemCapOf, newState } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import {
  COOK_STORAGE_CAP, ENERGY_ITEM_IDS, RECIPES, recipeById, toStoredEnergy,
} from '../../../../game/content/cooking';
import { resetBagView } from '../../game/tabs/bag/bagView';
import { resetKeyScopes } from '../../../ui/hotkeys';
import FacilityModal from './FacilityModal';

afterEach(() => { cleanup(); resetKeyScopes(); resetBagView(); });

const home = { kind: 'base', id: 'home' } as const;
const energy = (c = 0, r = 0, e = 0, l = 0): Record<string, number> => ({
  [ENERGY_ITEM_IDS.common]: toStoredEnergy(c), [ENERGY_ITEM_IDS.rare]: toStoredEnergy(r),
  [ENERGY_ITEM_IDS.epic]: toStoredEnergy(e), [ENERGY_ITEM_IDS.legendary]: toStoredEnergy(l),
});
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), boat: 5, location: home, ...over });

function show(game: GameState, result: { type: string; [k: string]: unknown } = { type: 'none' }) {
  const dispatch = vi.fn(() => ({ status: 'ok' as const, state: game, result: result as never }));
  const setToast = vi.fn();
  const onClose = vi.fn();
  render(<FacilityModal panel="kitchen" sellBonus={0} game={game} dispatch={dispatch} setToast={setToast} onClose={onClose} />);
  return { dispatch, setToast, onClose };
}
const tab = (name: string) => screen.getByRole('button', { name });
const optionNames = (list: string) =>
  within(screen.getByRole('listbox', { name: list })).getAllByRole('option').map(o => o.querySelector('.truncate')?.textContent);
const RARE_WAIT_MIN = recipeById('cook-lunch-rare')!.waitMs / 60_000;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe('부엌 창 틀과 대기열', () => {
  it('제목 부엌 아래 고정 정보 줄(조리 중·대기열·보관함)과 탭 셋(도시락, 미끼, 기운 변환)을 둔다', () => {
    show(seed());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('조리 중인 요리 없음')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '대기열 0건' })).toBeDisabled();
    expect(screen.getByText('보관함').closest('div')).toHaveTextContent(`0/${COOK_STORAGE_CAP}`);
    const tabs = ['도시락', '미끼', '기운 변환'].map(tab);
    expect(tabs[0]).toHaveClass('active');
    expect(tabs[0].compareDocumentPosition(tabs[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tabs[1].compareDocumentPosition(tabs[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: '기운 얻기' })).toBeNull();
    expect(screen.getAllByRole('button').filter(b => b.closest('.pf-tabbar'))).toHaveLength(3);
  });

  it('조리 중이면 정보 줄에 레시피와 완성 수와 다음 완성까지 남은 시간이 보이고 탭을 옮겨도 그대로다', () => {
    show(seed({
      cooking: {
        id: 'c1',
        recipe: 'cook-lunch-rare',
        count: 3,
        bonus: [false, false, false],
        startedAt: minutesAgo(RARE_WAIT_MIN + 1),
      },
    }));
    const line = screen.getByText('조리 중').closest('div')!;
    const cookingName = within(line).getByText('민 몰리');
    expect(cookingName).toBeInTheDocument();
    expect(cookingName.closest('b')).toBeNull();
    expect(line).toHaveTextContent('1/3');
    expect(screen.getByText(`${RARE_WAIT_MIN - 1}분`)).toBeInTheDocument();
    fireEvent.click(tab('기운 변환'));
    expect(screen.getByText('조리 중').closest('div')).toHaveTextContent('1/3');
  });

  it('대기열 펼치기 후 취소 버튼은 짧은 취소만 적고, 누르면 ConfirmDialog에서 100% 환급·승계 안내 후 cancelCook을 보낸다', () => {
    const game = seed({
      cooking: {
        id: 'c1',
        recipe: 'cook-lunch-rare',
        count: 3,
        bonus: [false, false, false],
        startedAt: minutesAgo(RARE_WAIT_MIN + 1),
      },
      cookingQueue: [
        { id: 'q1', recipe: 'cook-lunch-mutation', count: 2, bonus: [false, false] },
      ],
    });
    const { dispatch, setToast } = show(game, {
      type: 'cancelCook',
      recipe: 'cook-lunch-rare',
      count: 2,
      refund: { common: 2000, rare: 400, epic: 0, legendary: 0 },
    });

    const toggle = screen.getByRole('button', { name: '대기열 2건' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const drawer = screen.getByRole('list', { name: '조리 대기열' });
    const rows = within(drawer).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('조리 중')).toBeInTheDocument();
    expect(within(rows[0]).getByText('1/3')).toBeInTheDocument();
    expect(within(rows[1]).getByText('대기 1')).toBeInTheDocument();
    expect(within(rows[1]).getByText('0/2')).toBeInTheDocument();

    // 바깥 취소 버튼 라벨은 반드시 짧은 '취소'만 적는다
    const cancelBtn = within(rows[0]).getByRole('button', { name: '취소' });
    expect(cancelBtn).toHaveTextContent(/^취소$/);
    expect(screen.queryByText(/100% 환급\)/)).toBeNull();

    fireEvent.click(cancelBtn);
    const confirmDialog = screen.getByRole('dialog', { name: '조리 취소' });
    expect(within(confirmDialog).getByText('민 몰리')).toBeInTheDocument();
    expect(within(confirmDialog).getByText(/남은 2개/)).toBeInTheDocument();
    expect(within(confirmDialog).getByText('200개')).toBeInTheDocument();
    expect(within(confirmDialog).getByText('40개')).toBeInTheDocument();
    expect(within(confirmDialog).getByText(/생선 비리야니/)).toBeInTheDocument();

    fireEvent.click(within(confirmDialog).getByRole('button', { name: '취소하기' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'cancelCook', id: 'c1' });
    expect(screen.queryByRole('dialog', { name: '조리 취소' })).toBeNull();
    expect(setToast).toHaveBeenCalled();
  });

  it('보관함이 가득 차면 수를 위험색으로 보인다', () => {
    show(seed({ items: { 'cook-lunch-bite': COOK_STORAGE_CAP } }));
    const storageCount = screen.getByText('보관함').closest('span')?.parentElement?.querySelector('[data-progress-count]') as HTMLElement;
    expect(storageCount).toHaveTextContent(`${COOK_STORAGE_CAP}/${COOK_STORAGE_CAP}`);
    expect(storageCount).toHaveAttribute('data-tone', 'danger');
  });
});

describe('도시락 탭과 미끼 탭', () => {
  it('도시락 탭은 도시락 다섯 가지에 등급을 괄호로 붙여 목록에 보이고 제작 시간 배지를 둔다', () => {
    show(seed());
    expect(optionNames('도시락 목록')).toEqual([
      '가루디야(일반)',
      '민 몰리(희귀)',
      '생선 비리야니(영웅)',
      '암불 티얄(영웅)',
      '생선 탈리(전설)',
    ]);
    const options = within(screen.getByRole('listbox', { name: '도시락 목록' })).getAllByRole('option');
    expect(within(options[0]).getByText('즉시')).toBeInTheDocument();
    expect(within(options[0]).getByText('(일반)')).toHaveAttribute('data-rarity', 'common');
    expect(within(options[1]).getByText('3분')).toBeInTheDocument();
    expect(within(options[2]).getByText('5분')).toBeInTheDocument();
    expect(within(options[4]).getByText('10분')).toBeInTheDocument();
  });

  it('미끼 탭은 미끼의 이름 뒤에 표시 등급을 괄호로 붙이고 등급순에 특수를 뒤에 둔다', () => {
    show(seed());
    fireEvent.click(tab('미끼'));
    expect(optionNames('미끼 목록')).toEqual(['롱페퍼 미끼(희귀)', '큐베브 미끼(영웅)', '용연향 미끼(전설)', '사프란 미끼(특수)', '달빛 미끼(특수)']);
  });

  it('미끼 탭의 기본 선택은 목록의 첫째이고, 목록의 괄호만 등급색이다', () => {
    show(seed());
    fireEvent.click(tab('미끼'));
    const first = screen.getAllByRole('option')[0];
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(within(first).getByText('(희귀)')).toHaveAttribute('data-rarity', 'rare');
    const last = screen.getAllByRole('option')[3];
    expect(within(last).getByText('(특수)')).toHaveAttribute('data-rarity', 'special');
    expect(within(last).getByText('사프란 미끼').closest('[data-rarity]')).toBeNull();
  });

  it('상세 머리는 그림, 이름, 그 아래 설명이고 보유와 지속 시간 꼬리표는 없다', () => {
    show(seed({ items: { 'cook-lunch-bite': 3 } }));
    const desc = RECIPES.find(r => r.id === 'cook-lunch-bite')!.description;
    const lore = screen.getByText(desc);
    expect(lore.className).not.toContain('first-letter');
    expect(screen.queryByText(/^보유 \d+개$/)).toBeNull();
    expect(screen.queryByText(/^지속 시간 /)).toBeNull();
  });

  it('미끼의 상세 머리 이름은 괄호만 등급색이다', () => {
    show(seed());
    fireEvent.click(tab('미끼'));
    fireEvent.click(screen.getByRole('option', { name: /사프란 미끼/ }));
    const heroName = screen.getAllByText('(특수)').find(e => !e.closest('[role="option"]') && !e.closest('table'))!;
    expect(heroName).toHaveAttribute('data-rarity', 'special');
    expect(screen.getByText(RECIPES.find(r => r.id === 'cook-bait-mutation')!.description)).toBeInTheDocument();
  });

  it('수량 입력의 접근성 이름은 등급 괄호가 붙은 레시피 이름이다', () => {
    show(seed());
    fireEvent.click(tab('미끼'));
    fireEvent.click(screen.getByRole('option', { name: /롱페퍼 미끼/ }));
    expect(screen.getByRole('textbox', { name: '롱페퍼 미끼(희귀) 수량' })).toBeInTheDocument();
  });

  it('섹션 이름은 무엇의 값인지 드러난다 - 효과는 종류별 제목, 표는 조리에 필요와 보유, 수량은 조리 수량', () => {
    show(seed());
    expect(screen.getByText('도시락 효과')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['', '조리에 필요', '보유']);
    expect(screen.getByText('조리 수량')).toBeInTheDocument();
    expect(screen.getByText('조리 시간')).toBeInTheDocument();
    fireEvent.click(tab('미끼'));
    expect(screen.getByText('미끼 효과')).toBeInTheDocument();
    expect(screen.queryByText('효과')).toBeNull();
  });

  it('표의 맨 아래 줄은 그 레시피 이름(등급)이고 보유 칸에 완성 요리 수를 보이며 조리에 필요한 칸은 비운다', () => {
    show(seed({ items: { 'cook-bait-epic': 2 } }));
    fireEvent.click(tab('미끼'));
    fireEvent.click(screen.getByRole('option', { name: /큐베브 미끼/ }));
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    const last = rows[rows.length - 1];
    const cells = within(last).getAllByRole('cell');
    expect(cells.map(c => c.textContent)).toEqual(['큐베브 미끼(영웅)', '', '2']);
    expect(within(last).getByText('(영웅)')).toHaveAttribute('data-rarity', 'epic');
    expect(rows.slice(0, -1).map(r => within(r).getAllByRole('cell')[0].textContent)).toEqual(['생명의 기운(일반)', '생명의 기운(영웅)']);
  });

  it('도시락의 맨 아래 줄도 이름 뒤에 등급 괄호를 붙인다', () => {
    show(seed({ items: { 'cook-lunch-bite': 5 } }));
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(within(rows[rows.length - 1]).getAllByRole('cell').map(c => c.textContent)).toEqual(['가루디야(일반)', '', '5']);
  });

  it('고른 레시피의 필요와 보유를 생명의 기운(등급) 이름으로 보이고 모자라는 칸은 위험색이다', () => {
    show(seed({ items: energy(250, 5) }));
    fireEvent.click(screen.getByRole('option', { name: /민 몰리/ })); // 일반 100, 희귀 20
    const common = within(screen.getByRole('table')).getAllByText('생명의 기운')[0].closest('tr')!;
    expect(within(common).getByText('100')).not.toHaveClass('text-danger');
    expect(within(common).getByText('250')).toBeInTheDocument();
    const rare = within(screen.getByRole('table')).getAllByText('생명의 기운')[1].closest('tr')!;
    expect(within(rare).getByText('20')).toHaveClass('text-danger');
    expect(within(rare).getByText('5')).toHaveClass('text-danger');
  });

  it('보유가 소수 첫째 자리이면 소수로, 천 단위는 쉼표로 보이고, 목록의 단가는 정수로 보인다', () => {
    show(seed({ items: energy(1234.5, 5.1) }));
    fireEvent.click(screen.getByRole('option', { name: /민 몰리/ })); // 일반 100, 희귀 20
    const common = within(screen.getByRole('table')).getAllByText('생명의 기운')[0].closest('tr')!;
    expect(within(common).getByText('1,234.5')).toBeInTheDocument();
    const rare = within(screen.getByRole('table')).getAllByText('생명의 기운')[1].closest('tr')!;
    expect(within(rare).getByText('5.1')).toBeInTheDocument();
    expect(within(screen.getByRole('option', { name: /민 몰리/ })).getByText('100')).toBeInTheDocument();
  });

  it('효과는 이름 왼쪽 값 오른쪽으로 보이고 툴팁은 그 종류에 적용되는 낚시를 알린다', () => {
    show(seed());
    expect(screen.getByText('입질 대기')).toBeInTheDocument();
    expect(screen.getByText('−10%')).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByText('도시락 효과'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('방치로 낚을 때만 효과가 있어요.');
    fireEvent.mouseLeave(screen.getByText('도시락 효과'));
    fireEvent.click(tab('미끼'));
    fireEvent.mouseEnter(screen.getByText('미끼 효과'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('챔질해서 낚을 때만 효과가 있어요.');
  });

  it('지속 시간은 효과 칸의 마지막 줄이고 조리 시간은 수량 칸에 보인다', () => {
    show(seed({ items: energy(1000, 100) }));
    fireEvent.click(screen.getByRole('option', { name: /민 몰리/ }));
    const effect = screen.getByText('도시락 효과').parentElement!;
    const lines = [...effect.children].slice(1).map(l => l.textContent);
    expect(lines).toEqual(['희귀 어종 출현+10%', '영웅 어종 출현+10%', '전설 어종 출현+10%', '지속 시간9시간']);
    const cookTime = screen.getByText('조리 시간').parentElement!;
    expect(within(cookTime).getByText(`${RARE_WAIT_MIN}분`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '민 몰리(희귀) 수량 증가' }));
    expect(within(cookTime).getByText(`${2 * RARE_WAIT_MIN}분`)).toBeInTheDocument();
  });

  it('달빛 미끼의 비수치 효과는 키-값으로 쪼개지 않고 상세 설명 한 줄로 보인다', () => {
    show(seed({ items: energy(1000) }));
    fireEvent.click(tab('미끼'));
    fireEvent.click(screen.getByRole('option', { name: /달빛 미끼/ }));
    const effectBox = screen.getByText('미끼 효과').parentElement!;
    expect(within(effectBox).getByText('낮에도 밤 어종이 함께 낚여요.')).toBeInTheDocument();
    expect(within(effectBox).queryByText('낮에도 출현')).toBeNull();
    expect(within(effectBox).queryByText('밤 어종 출현')).toBeNull();
    expect(within(effectBox).getByText('지속 시간')).toBeInTheDocument();
  });

  it('즉시 완성 요리는 즉시로 보이고 버튼 라벨이 즉시 완성이다', () => {
    const { dispatch } = show(seed({ items: energy(2000) }));
    expect(screen.getByRole('button', { name: '즉시 완성' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '가루디야(일반) 수량 증가' }));
    fireEvent.click(screen.getByRole('button', { name: '즉시 완성' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'cook', recipe: 'cook-lunch-bite', count: 2 });

    fireEvent.click(tab('미끼'));
    expect(screen.getByRole('button', { name: '즉시 완성' })).toBeInTheDocument();
  });

  it('대기 시간 있는 요리는 조리 중이 아니면 조리 시작, 조리 중이면 대기열에 추가 버튼을 보인다', () => {
    const { dispatch } = show(seed({ items: energy(2000, 200) }));
    fireEvent.click(screen.getByRole('option', { name: /민 몰리/ }));
    fireEvent.click(screen.getByRole('button', { name: '조리 시작' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'cook', recipe: 'cook-lunch-rare', count: 1 });

    cleanup();
    const busyGame = seed({
      items: energy(2000, 200),
      cooking: { id: 'c1', recipe: 'cook-lunch-rare', count: 1, bonus: [false], startedAt: minutesAgo(1) },
    });
    const { dispatch: d2 } = show(busyGame);
    fireEvent.click(screen.getByRole('option', { name: /민 몰리/ }));
    const queueBtn = screen.getByRole('button', { name: '대기열에 추가' });
    expect(queueBtn).toBeEnabled();
    fireEvent.click(queueBtn);
    expect(d2).toHaveBeenCalledWith({ type: 'cook', recipe: 'cook-lunch-rare', count: 1 });
  });

  it('확정 버튼은 스크롤 본문 밖(하단 고정 자리)에 있다', () => {
    show(seed({ items: energy(1000) }));
    expect(screen.getByRole('button', { name: '즉시 완성' }).closest('.pf-vscroll')).toBeNull();
  });

  it('기운이 모자라면 시작이 막히고 이유는 게임 규칙의 거부 문구로 버튼 툴팁에 보인다', () => {
    show(seed({ items: energy(10) }));
    const button = screen.getByRole('button', { name: '즉시 완성' });
    expect(button).toBeDisabled();
    fireEvent.mouseEnter(button.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('생명의 기운이 부족해요.');
  });

  it('보관함이 가득하면 수량은 0이고 이유는 보관함이다', () => {
    show(seed({ items: { ...energy(1000), 'cook-lunch-bite': COOK_STORAGE_CAP } }));
    const button = screen.getByRole('button', { name: '즉시 완성' });
    expect(button).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '가루디야(일반) 수량' })).toHaveValue('0');
    fireEvent.mouseEnter(button.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('보관함이 가득 찼어요.');
  });

  it('집 밖이면 게임 규칙의 거부 사유를 그대로 보인다', () => {
    show(seed({ items: energy(1000), location: { kind: 'region', id: 'village' } }));
    const button = screen.getByRole('button', { name: '즉시 완성' });
    fireEvent.mouseEnter(button.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('집에서만 할 수 있어요.');
  });

  it('진주 상인의 저울이 있으면 추가 완성 확률을 요리 추가 완성 +N%p로 보이고 없으면 줄이 없다', () => {
    show(seed({ items: energy(1000) }));
    expect(screen.queryByText('요리 추가 완성')).toBeNull();
    cleanup();
    show(seed({ items: energy(1000), artifacts: ['varuna-scale'] }));
    expect(screen.getByText('요리 추가 완성')).toBeInTheDocument();
    expect(screen.getByText('+10%p')).toBeInTheDocument();
  });
});

describe('기운 변환 탭', () => {
  it('3종 정방향 10:1 카드, 배수 선택, 미리보기, 하단 안내 상자를 보이고 변환 시 transmuteEnergy 액션을 보낸다', () => {
    const { dispatch, setToast } = show(
      seed({ items: energy(125, 10, 0, 0) }),
      { type: 'transmuteEnergy', from: 'common', to: 'rare', count: 10, spent: 1000, gained: 100 },
    );
    fireEvent.click(tab('기운 변환'));

    expect(screen.getByText(/하위 생명의 기운 10개를 한 단계 위 생명의 기운 1개로 바꿔요/)).toBeInTheDocument();
    const cards = screen.getAllByRole('region');
    expect(cards).toHaveLength(3);

    const commonCard = cards[0];
    expect(commonCard.querySelectorAll('canvas')).toHaveLength(2);
    expect(within(commonCard).getAllByText('125')[0]).toBeInTheDocument();
    fireEvent.click(within(commonCard).getByRole('button', { name: '×10' }));
    expect(within(commonCard).getAllByText('25')[0]).toBeInTheDocument();
    expect(within(commonCard).getAllByText('20')[0]).toBeInTheDocument();
    expect(within(commonCard).getByText('(−100)')).toBeInTheDocument();
    expect(within(commonCard).getByText('(+10)')).toBeInTheDocument();
    fireEvent.click(within(commonCard).getByRole('button', { name: '변환' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'transmuteEnergy', from: 'common', count: 10 });
    expect(setToast).toHaveBeenCalled();

    const epicCard = cards[2];
    const epicBtn = within(epicCard).getByRole('button', { name: '변환' });
    expect(epicBtn).toBeDisabled();
    fireEvent.mouseEnter(epicBtn.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('생명의 기운이 부족해요.');
  });

  it('상위 기운이 저장 상한이면 변환이 막히고 사유 툴팁을 보인다', () => {
    show(seed({
      items: {
        [ENERGY_ITEM_IDS.common]: toStoredEnergy(100),
        [ENERGY_ITEM_IDS.rare]: itemCapOf(ENERGY_ITEM_IDS.rare),
      },
    }));
    fireEvent.click(tab('기운 변환'));
    const commonCard = screen.getAllByRole('region')[0];
    const btn = within(commonCard).getByRole('button', { name: '변환' });
    expect(btn).toBeDisabled();
    fireEvent.mouseEnter(btn.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('상위 기운이 보관 상한에 닿아 더 바꿀 수 없어요.');
  });
});
