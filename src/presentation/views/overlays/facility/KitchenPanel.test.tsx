// 부엌 창 — 고정 정보 줄과 탭, 도시락과 미끼 탭의 레시피와 조리 시작, 기운 얻기 탭의 선택과 톱니바퀴 팝오버.
// 조리 가능 여부와 기운 얻기 기본 선택은 게임 규칙의 판정이고, 이 테스트는 판정이 화면에 그대로 닿는지 본다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FISH, newState } from '../../../../game/rules/logic';
import type { FishInstance, GameState } from '../../../../game/rules/logic';
import type { SpotId } from '../../../../game/content/spots';
import { COOK_STORAGE_CAP, ENERGY_ITEM_IDS, toStoredEnergy } from '../../../../game/content/cooking';
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
const fishIn = (spot: SpotId) => FISH.find(f => f.spot === spot && f.rarity === 'common')!;
const inst = (uid: string, spot: SpotId, over: Partial<FishInstance> = {}): FishInstance =>
  ({ uid, fishId: fishIn(spot).id, form: 'normal', size: 20, caughtAt: null, spot: null, judgment: null, locked: false, ...over });

function show(game: GameState, result: { type: string; [k: string]: unknown } = { type: 'none' }) {
  const dispatch = vi.fn(() => ({ status: 'ok' as const, state: game, result: result as never }));
  const setToast = vi.fn();
  const onClose = vi.fn();
  render(<FacilityModal panel="kitchen" sellBonus={0} game={game} dispatch={dispatch} setToast={setToast} onClose={onClose} />);
  return { dispatch, setToast, onClose };
}
const tab = (name: string) => screen.getByRole('button', { name });
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe('부엌 창 틀', () => {
  it('제목 부엌 아래 고정 정보 줄과 탭 셋(도시락, 미끼, 기운 얻기)을 둔다', () => {
    show(seed());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('조리 중인 요리 없음')).toBeInTheDocument();
    expect(screen.getByText('보관함')).toBeInTheDocument();
    expect(screen.getByText(`0/${COOK_STORAGE_CAP}`)).toBeInTheDocument();
    const tabs = ['도시락', '미끼', '기운 얻기'].map(tab);
    expect(tabs[0]).toHaveClass('active');
    expect(tabs[0].compareDocumentPosition(tabs[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tabs[1].compareDocumentPosition(tabs[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('조리 중이면 정보 줄에 레시피와 완성 수와 다음 완성까지 남은 시간이 보이고 탭을 옮겨도 그대로다', () => {
    show(seed({ cooking: { recipe: 'cook-lunch-bite', count: 3, bonus: [false, false, false], startedAt: minutesAgo(90) } }));
    const line = screen.getByText('조리 중').closest('div')!;
    expect(within(line).getByText('가루디야')).toBeInTheDocument();
    expect(within(line).getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('30분')).toBeInTheDocument();
    fireEvent.click(tab('기운 얻기'));
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
    const names = within(screen.getByRole('listbox', { name: '도시락 목록' })).getAllByRole('option').map(o => o.querySelector('b')?.textContent);
    expect(names).toEqual(['가루디야', '민 몰리', '생선 비리야니', '암불 티얄', '생선 탈리']);
  });

  it('미끼 탭은 등급 미끼의 이름 뒤에 등급을 괄호로 붙이고 다른 미끼에는 붙이지 않는다', () => {
    show(seed());
    fireEvent.click(tab('미끼'));
    const names = within(screen.getByRole('listbox', { name: '미끼 목록' })).getAllByRole('option').map(o => o.querySelector('b')?.textContent);
    expect(names).toEqual(['사프란 미끼', '롱페퍼 미끼(희귀)', '큐베브 미끼(영웅)', '용연향 미끼(전설)']);
  });

  it('수량 입력의 접근성 이름은 등급 괄호가 붙은 레시피 이름이다', () => {
    show(seed());
    fireEvent.click(tab('미끼'));
    fireEvent.click(screen.getByRole('option', { name: /롱페퍼 미끼/ }));
    expect(screen.getByRole('textbox', { name: '롱페퍼 미끼(희귀) 수량' })).toBeInTheDocument();
  });

  it('고른 레시피의 필요와 보유를 생명의 기운(등급) 이름으로 보이고 모자라는 칸은 위험색이다', () => {
    show(seed({ items: energy(250, 5) }));
    fireEvent.click(screen.getByRole('option', { name: /민 몰리/ })); // 일반 100, 희귀 20
    const common = screen.getByText('생명의 기운(일반)').closest('tr')!;
    expect(within(common).getByText('100')).not.toHaveClass('text-danger');
    expect(within(common).getByText('250')).toBeInTheDocument();
    const rare = screen.getByText('생명의 기운(희귀)').closest('tr')!;
    expect(within(rare).getByText('20')).toHaveClass('text-danger');
    expect(within(rare).getByText('5')).toHaveClass('text-danger');
  });

  it('보유가 소수 첫째 자리이면 소수로, 천 단위는 쉼표로 보이고, 목록의 단가는 정수로 보인다', () => {
    show(seed({ items: energy(1234.5, 5.1) }));
    fireEvent.click(screen.getByRole('option', { name: /민 몰리/ })); // 일반 100, 희귀 20
    const common = screen.getByText('생명의 기운(일반)').closest('tr')!;
    expect(within(common).getByText('1,234.5')).toBeInTheDocument();
    const rare = screen.getByText('생명의 기운(희귀)').closest('tr')!;
    expect(within(rare).getByText('5.1')).toBeInTheDocument();
    expect(within(screen.getByRole('option', { name: /민 몰리/ })).getByText('100')).toBeInTheDocument();
  });

  it('효과는 이름 왼쪽 값 오른쪽으로 보이고 툴팁은 그 종류에 적용되는 낚시를 알린다', () => {
    show(seed());
    expect(screen.getByText('입질 대기')).toBeInTheDocument();
    expect(screen.getByText('−10%')).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByText('효과'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('방치로 낚을 때만 효과가 있어요.');
    fireEvent.mouseLeave(screen.getByText('효과'));
    fireEvent.click(tab('미끼'));
    fireEvent.mouseEnter(screen.getByText('효과'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('챔질해서 낚을 때만 효과가 있어요.');
  });

  it('지속 시간과 조리 시간을 보인다', () => {
    show(seed({ items: energy(1000) }));
    expect(screen.getByText('지속 시간 9시간')).toBeInTheDocument();
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

describe('기운 얻기 탭', () => {
  // 배 5의 기본값: 가장 앞선 해역(인도양)만 꺼짐, 그 앞 해역은 켜짐
  const bag = () => [inst('a1', 'pond'), inst('a2', 'pond'), inst('b1', 'sea'), inst('c1', 'indian')];
  const open = (game = seed({ bag: bag() }), result?: { type: string; [k: string]: unknown }) => {
    const out = show(game, result);
    fireEvent.click(tab('기운 얻기'));
    return out;
  };
  const rowOf = (spot: SpotId) => screen.getByText(fishIn(spot).name).closest('tr')!;

  it('판매 창과 같은 표(어종, 등급, 수량)에 체크 열과 생명의 기운 열을 둔다', () => {
    open();
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['선택', '어종', '등급', '수량', '생명의 기운']);
  });

  it('체크 기본값은 게임 규칙을 따른다 — 가장 앞선 해역의 어종은 꺼지고 그 앞 해역은 켜진다', () => {
    open();
    expect(within(rowOf('pond')).getByText('+2')).toBeInTheDocument();
    expect(within(rowOf('sea')).getByText('+1')).toBeInTheDocument();
    expect(within(rowOf('indian')).getByText('0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '기운 얻기 (3마리)' })).toBeEnabled();
  });

  it('확정 버튼은 고른 개체의 uid로 extractEnergy를 보내고 창은 그대로 열려 있다', () => {
    const { dispatch, onClose } = open(seed({ bag: bag() }), { type: 'extract', energy: { common: 30, rare: 0, epic: 0, legendary: 0 } });
    fireEvent.click(screen.getByRole('button', { name: '기운 얻기 (3마리)' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'extractEnergy', uids: ['a1', 'a2', 'b1'] });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('결과는 메시지 창 한 줄로 알리고 등급별 목록 툴팁을 단다', () => {
    const { setToast } = open(seed({ bag: bag() }), { type: 'extract', energy: { common: 380, rare: 20, epic: 0, legendary: 0 } });
    fireEvent.click(screen.getByRole('button', { name: '기운 얻기 (3마리)' }));
    expect(setToast).toHaveBeenCalledWith('생명의 기운 40개를 얻었어요!', 'gold', {
      target: '40',
      rows: [{ label: '생명의 기운(일반)', value: '+38' }, { label: '생명의 기운(희귀)', value: '+2' }],
    });
  });

  it('결과의 기운이 소수 첫째 자리이면 소수로 알린다', () => {
    const { setToast } = open(seed({ bag: bag() }), { type: 'extract', energy: { common: 15, rare: 5, epic: 0, legendary: 0 } });
    fireEvent.click(screen.getByRole('button', { name: '기운 얻기 (3마리)' }));
    expect(setToast).toHaveBeenCalledWith('생명의 기운 2개를 얻었어요!', 'gold', {
      target: '2',
      rows: [{ label: '생명의 기운(일반)', value: '+1.5' }, { label: '생명의 기운(희귀)', value: '+0.5' }],
    });
  });

  it('행 체크를 해제하면 그 어종은 빠지고 개체 수가 버튼에 보인다', () => {
    const { dispatch } = open();
    fireEvent.click(screen.getByRole('button', { name: `${fishIn('pond').name} 기운 얻기 해제` }));
    fireEvent.click(screen.getByRole('button', { name: '기운 얻기 (1마리)' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'extractEnergy', uids: ['b1'] });
  });

  it('고른 것이 없으면 확정 버튼이 막힌다', () => {
    open(seed({ bag: [inst('c1', 'indian')] }));
    expect(screen.getByRole('button', { name: '기운 얻기 (0마리)' })).toBeDisabled();
  });

  it('판매 시설이 있는 거점 밖이면 확정이 막히고 게임 규칙의 거부 사유가 툴팁이다', () => {
    open(seed({ bag: bag(), location: { kind: 'region', id: 'village' } }));
    const button = screen.getByRole('button', { name: '기운 얻기 (3마리)' });
    expect(button).toBeDisabled();
    fireEvent.mouseEnter(button.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('집이나 항구에서만 할 수 있어요.');
  });

  it('잠근 개체가 있으면 확정 영역에 안내가 보이고 되돌릴 수 없다는 안내는 늘 보인다', () => {
    open(seed({ bag: [inst('a1', 'pond'), inst('a2', 'pond', { locked: true })] }));
    expect(screen.getByText(/잠근 개체 1마리는 기운 얻기에서 빠져요/)).toBeVisible();
    expect(screen.getByText(/기운을 얻은 물고기는 가방에서 사라져요/)).toBeInTheDocument();
  });

  it('잠근 개체가 없을 때도 안내 자리는 같은 높이로 두고 보이지 않게 한다', () => {
    open();
    const note = screen.getByText(/기운 얻기에서 빠져요/, { selector: 'p' });
    expect(note).toHaveClass('invisible');
  });

  it('합계 줄의 툴팁은 등급별 목록이다', () => {
    const rare = FISH.find(f => f.spot === 'pond' && f.rarity === 'rare')!;
    open(seed({ bag: [inst('a1', 'pond'), { ...inst('a2', 'pond'), fishId: rare.id }] }));
    fireEvent.mouseEnter(screen.getByText('+2', { selector: 'span.pf-accent' }));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('생명의 기운(일반)');
    expect(tip).toHaveTextContent('생명의 기운(희귀)');
  });
});

describe('해역별 기운 대상 팝오버', () => {
  const bag = () => [inst('a1', 'pond'), inst('a2', 'pond'), inst('b1', 'sea')];
  const open = (game = seed({ bag: bag() })) => {
    const out = show(game);
    fireEvent.click(tab('기운 얻기'));
    return out;
  };
  const gear = () => screen.getByRole('button', { name: '해역별 기운 대상 고르기' });
  const pop = () => screen.getByRole('group', { name: '해역별 기운 대상' });

  it('톱니바퀴 버튼은 확정 버튼 왼쪽에 있고 누르면 그 버튼에 붙은 팝오버가 열린다', () => {
    open();
    const confirm = screen.getByRole('button', { name: /^기운 얻기 \(/ });
    expect(gear().compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(gear()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(gear());
    expect(gear()).toHaveAttribute('aria-expanded', 'true');
    expect(pop()).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1); // 창이 하나 더 뜨지 않는다
  });

  it('톱니바퀴 버튼은 확정 버튼과 같은 높이의 정사각형이다', () => {
    open();
    expect(gear()).toHaveClass('h-full', 'aspect-square');
    expect(screen.getByRole('button', { name: /기운 얻기 \(/ })).not.toHaveClass('h-10');
  });

  it('배로 갈 수 있는 해역마다 켜짐과 꺼짐 칩을 가장 앞선 해역부터 보인다', () => {
    open();
    fireEvent.click(gear());
    const chips = within(pop()).getAllByRole('button').filter(b => b.hasAttribute('aria-pressed'));
    expect(chips.map(c => c.getAttribute('aria-label'))[0]).toBe('인도양 기운 대상');
    expect(within(pop()).getByRole('button', { name: '인도양 기운 대상' })).toHaveTextContent('꺼짐');
    expect(within(pop()).getByRole('button', { name: '마을 연못 기운 대상' })).toHaveTextContent('켜짐');
  });

  it('칩을 누르면 setEnergyTarget을 보낸다', () => {
    const { dispatch } = open();
    fireEvent.click(gear());
    fireEvent.click(within(pop()).getByRole('button', { name: '마을 연못 기운 대상' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'setEnergyTarget', spot: 'pond', on: false });
  });

  it('덮어쓴 해역이 없으면 되돌리기가 비활성이고 덮어쓴 해역이 있으면 켜진다', () => {
    open();
    fireEvent.click(gear());
    expect(within(pop()).getByRole('button', { name: '기본값으로 되돌리기' })).toBeDisabled();
    cleanup();
    const { dispatch } = open(seed({ bag: bag(), energyTargets: { pond: false } }));
    fireEvent.click(gear());
    const reset = within(pop()).getByRole('button', { name: '기본값으로 되돌리기' });
    expect(reset).toBeEnabled();
    fireEvent.click(reset);
    expect(dispatch).toHaveBeenCalledWith({ type: 'resetEnergyTargets' });
  });

  it('덮어쓴 해역에는 금색 점이 있고 점 툴팁은 기본값을 알린다', () => {
    open(seed({ bag: bag(), energyTargets: { pond: false } }));
    fireEvent.click(gear());
    const row = within(pop()).getByText('마을 연못').closest('div')!;
    const dot = row.querySelector('.bg-gold')!;
    expect(dot).not.toBeNull();
    fireEvent.mouseEnter(dot.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('기본값은 켜짐이에요.');
    expect(within(pop()).getByText('인도양').closest('div')!.querySelector('.bg-gold')).toBeNull();
  });

  it('덮어쓴 해역이 있으면 톱니바퀴에 금색 점이 있고 툴팁이 한 줄 더한다', () => {
    open();
    expect(gear().querySelector('.bg-gold')).toBeNull();
    cleanup();
    open(seed({ bag: bag(), energyTargets: { pond: false } }));
    expect(gear().querySelector('.bg-gold')).not.toBeNull();
    fireEvent.mouseEnter(gear().parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('기본값과 다르게 고른 해역이 있어요.');
  });

  it('바깥을 누르거나 Esc를 누르면 팝오버만 닫히고 부엌 창은 열려 있다', () => {
    const { onClose } = open();
    fireEvent.click(gear());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: '해역별 기운 대상' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(gear());
    fireEvent.pointerDown(screen.getByText('보관함'));
    expect(screen.queryByRole('group', { name: '해역별 기운 대상' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('해역을 바꾸면 그 해역 행만 새 기본값을 따르고 다른 해역에서 직접 고른 체크는 남는다', () => {
    open();
    // 연못 어종과 바다 어종을 모두 직접 해제한다
    fireEvent.click(screen.getByRole('button', { name: `${fishIn('pond').name} 기운 얻기 해제` }));
    fireEvent.click(screen.getByRole('button', { name: `${fishIn('sea').name} 기운 얻기 해제` }));
    expect(screen.getByRole('button', { name: '기운 얻기 (0마리)' })).toBeDisabled();
    // 연못 해역 칩을 누른다 — 연못 행만 다시 정해져 켜짐 기본값을 따른다
    fireEvent.click(gear());
    fireEvent.click(within(pop()).getByRole('button', { name: '마을 연못 기운 대상' }));
    expect(screen.getByRole('button', { name: '기운 얻기 (2마리)' })).toBeInTheDocument();
    expect(within(screen.getByText(fishIn('sea').name).closest('tr')!).getByText('0')).toBeInTheDocument();
  });
});
