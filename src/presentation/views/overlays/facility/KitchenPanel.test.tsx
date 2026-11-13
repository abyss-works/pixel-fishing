// 부엌 창 — 고정 정보 줄과 탭, 도시락과 미끼 탭의 레시피와 조리 시작.
// 조리 가능 여부는 게임 규칙의 판정이고, 이 테스트는 판정이 화면에 그대로 닿는지 본다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { newState } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import { COOK_STORAGE_CAP, ENERGY_ITEM_IDS, RECIPES, toStoredEnergy } from '../../../../game/content/cooking';
import { resetBagView } from '../../game/tabs/bag/bagView';
import { resetKeyScopes } from '../../../ui/hotkeys';
import FacilityModal from './FacilityModal';

afterEach(() => { cleanup(); resetKeyScopes(); resetBagView(); });

const home = { kind: 'base', id: 'home' } as const;
// 등급별 보유 기운 — 인자는 화면 단위이고 items에는 저장 단위로 넣는다
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
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe('부엌 창 틀', () => {
  it('제목 부엌 아래 고정 정보 줄과 탭 둘(도시락, 미끼)만 둔다', () => {
    show(seed());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('조리 중인 요리 없음')).toBeInTheDocument();
    expect(screen.getByText('보관함')).toBeInTheDocument();
    expect(screen.getByText(`0/${COOK_STORAGE_CAP}`)).toBeInTheDocument();
    const tabs = ['도시락', '미끼'].map(tab);
    expect(tabs[0]).toHaveClass('active');
    expect(tabs[0].compareDocumentPosition(tabs[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: '기운 얻기' })).toBeNull();
    expect(screen.getAllByRole('button').filter(b => b.closest('.pf-tabbar'))).toHaveLength(2);
  });

  it('조리 중이면 정보 줄에 레시피와 완성 수와 다음 완성까지 남은 시간이 보이고 탭을 옮겨도 그대로다', () => {
    show(seed({ cooking: { recipe: 'cook-lunch-bite', count: 3, bonus: [false, false, false], startedAt: minutesAgo(90) } }));
    const line = screen.getByText('조리 중').closest('div')!;
    expect(within(line).getByText('가루디야')).toBeInTheDocument();
    expect(within(line).getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('30분')).toBeInTheDocument();
    fireEvent.click(tab('미끼'));
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('보관함이 가득 차면 수를 위험색으로 보인다', () => {
    show(seed({ items: { 'cook-lunch-bite': COOK_STORAGE_CAP } }));
    expect(screen.getByText(`${COOK_STORAGE_CAP}/${COOK_STORAGE_CAP}`)).toHaveClass('text-danger');
  });
});

describe('도시락 탭과 미끼 탭', () => {
  it('도시락 탭은 도시락 다섯 가지를 콘텐츠 이름으로 목록에 보인다', () => {
    show(seed());
    expect(optionNames('도시락 목록')).toEqual(['가루디야', '민 몰리', '생선 비리야니', '암불 티얄', '생선 탈리']);
  });

  it('미끼 탭은 미끼의 이름 뒤에 표시 등급을 괄호로 붙이고 등급순에 특수를 뒤에 둔다', () => {
    show(seed());
    fireEvent.click(tab('미끼'));
    expect(optionNames('미끼 목록')).toEqual(['롱페퍼 미끼(희귀)', '큐베브 미끼(영웅)', '용연향 미끼(전설)', '사프란 미끼(특수)']);
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

  it('표의 맨 아래 줄은 그 레시피 이름이고 보유 칸에 완성 요리 수를 보이며 조리에 필요한 칸은 비운다', () => {
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

  it('도시락의 맨 아래 줄은 등급 괄호 없이 이름만 쓴다', () => {
    show(seed({ items: { 'cook-lunch-bite': 5 } }));
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(within(rows[rows.length - 1]).getAllByRole('cell').map(c => c.textContent)).toEqual(['가루디야', '', '5']);
  });

  it('고른 레시피의 필요와 보유를 생명의 기운(등급) 이름으로 보이고 모자라는 칸은 위험색이다', () => {
    show(seed({ items: energy(250, 5) }));
    fireEvent.click(screen.getByRole('option', { name: /민 몰리/ })); // 일반 100, 희귀 20
    const common = screen.getByText('(일반)').closest('tr')!;
    expect(within(common).getByText('100')).not.toHaveClass('text-danger');
    expect(within(common).getByText('250')).toBeInTheDocument();
    const rare = screen.getByText('(희귀)').closest('tr')!;
    expect(within(rare).getByText('20')).toHaveClass('text-danger');
    expect(within(rare).getByText('5')).toHaveClass('text-danger');
  });

  it('보유가 소수 첫째 자리이면 소수로, 천 단위는 쉼표로 보이고, 목록의 단가는 정수로 보인다', () => {
    show(seed({ items: energy(1234.5, 5.1) }));
    fireEvent.click(screen.getByRole('option', { name: /민 몰리/ })); // 일반 100, 희귀 20
    const common = screen.getByText('(일반)').closest('tr')!;
    expect(within(common).getByText('1,234.5')).toBeInTheDocument();
    const rare = screen.getByText('(희귀)').closest('tr')!;
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
    show(seed({ items: energy(1000) }));
    const effect = screen.getByText('도시락 효과').parentElement!;
    const lines = [...effect.children].slice(1).map(l => l.textContent);
    expect(lines).toEqual(['입질 대기−10%', '지속 시간9시간']);
    expect(screen.getByText('1시간')).toBeInTheDocument(); // 조리 시간(1개)
    fireEvent.click(screen.getByRole('button', { name: '가루디야 수량 증가' }));
    expect(screen.getByText('2시간')).toBeInTheDocument();
  });

  it('조리 시작은 고른 레시피와 수량으로 cook 액션을 보낸다', () => {
    const { dispatch } = show(seed({ items: energy(2000) }));
    fireEvent.click(screen.getByRole('button', { name: '가루디야 수량 증가' }));
    fireEvent.click(screen.getByRole('button', { name: '조리 시작' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'cook', recipe: 'cook-lunch-bite', count: 2 });
  });

  it('조리 시작 버튼은 스크롤 본문 밖(하단 고정 자리)에 있다', () => {
    show(seed({ items: energy(1000) }));
    expect(screen.getByRole('button', { name: '조리 시작' }).closest('.pf-vscroll')).toBeNull();
  });

  it('기운이 모자라면 시작이 막히고 이유는 게임 규칙의 거부 문구로 버튼 툴팁에 보인다', () => {
    show(seed({ items: energy(10) }));
    const button = screen.getByRole('button', { name: '조리 시작' });
    expect(button).toBeDisabled();
    fireEvent.mouseEnter(button.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('생명의 기운이 부족해요.');
  });

  it('조리 중에는 다른 레시피를 골라 볼 수 있고 시작만 막힌다', () => {
    show(seed({ items: energy(1000), cooking: { recipe: 'cook-lunch-bite', count: 2, bonus: [false, false], startedAt: minutesAgo(10) } }));
    fireEvent.click(screen.getByRole('option', { name: /민 몰리/ }));
    const button = screen.getByRole('button', { name: '조리 시작' });
    expect(button).toBeDisabled();
    fireEvent.mouseEnter(button.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('이미 조리 중인 요리가 있어요.');
  });

  it('보관함이 가득하면 수량은 0이고 이유는 보관함이다', () => {
    show(seed({ items: { ...energy(1000), 'cook-lunch-bite': COOK_STORAGE_CAP } }));
    const button = screen.getByRole('button', { name: '조리 시작' });
    expect(button).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '가루디야 수량' })).toHaveValue('0');
    fireEvent.mouseEnter(button.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('보관함이 가득 찼어요.');
  });

  it('집 밖이면 게임 규칙의 거부 사유를 그대로 보인다', () => {
    show(seed({ items: energy(1000), location: { kind: 'region', id: 'village' } }));
    const button = screen.getByRole('button', { name: '조리 시작' });
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
