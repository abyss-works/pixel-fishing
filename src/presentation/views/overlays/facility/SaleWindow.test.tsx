// 판매 창 — 집의 궤짝과 항구의 어시장이 쓰는 같은 창. 탭 둘(판매, 기운 얻기)의 틀, 비교 표와 확정 영역, 기운 얻기 탭의 선택과 팝오버, 잠금.
// 판매 대상과 기운 얻기 기본 선택, 확정 가능 여부는 게임 규칙의 판정이고, 이 테스트는 판정이 화면에 그대로 닿는지 본다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FISH, newState } from '../../../../game/rules/logic';
import type { FishInstance, GameState } from '../../../../game/rules/logic';
import type { BaseId } from '../../../../game/content/places';
import type { SpotId } from '../../../../game/content/spots';
import { COOKING_UNLOCK_BOAT, ENERGY_ITEM_IDS, toStoredEnergy } from '../../../../game/content/cooking';
import { resetBagView } from '../../game/tabs/bag/bagView';
import { resetKeyScopes } from '../../../ui/hotkeys';
import FacilityModal from './FacilityModal';

afterEach(() => { cleanup(); resetKeyScopes(); resetBagView(); });

const home = { kind: 'base', id: 'home' } as const;
const crucian = FISH.find(f => f.id === 'crucian')!;
const carp = FISH.find(f => f.id === 'carp')!;
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), boat: 5, location: home, ...over });
const fishIn = (spot: SpotId) => FISH.find(f => f.spot === spot && f.rarity === 'common')!;
const inst = (uid: string, fishId: string, over: Partial<FishInstance> = {}): FishInstance =>
  ({ uid, fishId, form: 'normal', size: 20, caughtAt: null, spot: null, judgment: null, locked: false, ...over });
const inSpot = (uid: string, spot: SpotId, over: Partial<FishInstance> = {}): FishInstance => inst(uid, fishIn(spot).id, over);

function show(game: GameState, opts: { base?: BaseId; guest?: boolean; result?: { type: string; [k: string]: unknown } } = {}) {
  const dispatch = vi.fn(() => ({ status: 'ok' as const, state: game, result: (opts.result ?? { type: 'none' }) as never }));
  const setToast = vi.fn();
  const onClose = vi.fn();
  render(<FacilityModal panel="sell" base={opts.base ?? 'home'} guest={opts.guest} sellBonus={0} game={game}
                        dispatch={dispatch} setToast={setToast} onClose={onClose} />);
  return { dispatch, setToast, onClose };
}
const tab = (name: string) => screen.getAllByRole('button').find(b => b.closest('.pf-tabbar') && b.textContent?.startsWith(name))!;
const heads = (table: HTMLElement) => within(table).getAllByRole('columnheader').map(h => h.textContent);
const tables = () => screen.getAllByRole('table');
const compareTable = () => tables().find(t => heads(t)[1] === '현재')!;
const fishTable = () => tables().find(t => heads(t)[1] === '어종')!;
const title = () => screen.getByRole('heading', { level: 3 }).textContent;

describe('판매 창 틀', () => {
  it('집에서는 궤짝, 항구에서는 어시장이다. 가방 마릿수는 제목에 넣지 않는다', () => {
    show(seed({ bag: [inst('a', crucian.id)] }));
    expect(title()).toBe('궤짝');
    cleanup();
    show(seed({ bag: [inst('a', crucian.id)] }), { base: 'harbor' });
    expect(title()).toBe('어시장');
  });

  it('판매 시설이 있는 항구 다섯 곳이 모두 같은 구성의 창을 연다', () => {
    for (const base of ['harbor', 'manila', 'colombo', 'toamasina', 'walvisbay'] as const) {
      show(seed({ bag: [inst('a', crucian.id)] }), { base });
      expect(title(), base).toBe('어시장');
      expect(['판매', '기운 얻기'].map(n => tab(n).textContent), base).toEqual(['판매', '기운 얻기']);
      expect(screen.getByRole('button', { name: /^판매 \(/ }), base).toBeInTheDocument();
      cleanup();
    }
  });

  it('창 위에 탭 둘(판매, 기운 얻기)이 있고 판매가 먼저 열려 있다', () => {
    show(seed());
    const [sell, energy] = [tab('판매'), tab('기운 얻기')];
    expect(sell).toHaveClass('active');
    expect(energy).not.toHaveClass('active');
    expect(sell.compareDocumentPosition(energy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('판매 탭', () => {
  it('어종 표의 열 이름은 판매, 어종, 등급, 수량, 소계다', () => {
    show(seed({ bag: [inst('a', crucian.id)] }));
    expect(heads(fishTable())).toEqual(['판매', '어종', '등급', '수량', '소계']);
  });

  it('비교 표는 현재와 판매 후 열에 골드와 가방 줄을 보인다', () => {
    show(seed({ gold: 120, bag: [inst('a', crucian.id), inst('b', carp.id), inst('c', carp.id, { locked: true })] }));
    expect(heads(compareTable()).slice(1)).toEqual(['현재', '판매 후']);
    const gold = within(compareTable()).getByText('골드').closest('tr')!;
    expect(within(gold).getByText('120G')).toBeInTheDocument();
    expect(within(gold).getByText(`${120 + crucian.price + carp.price}G`)).toBeInTheDocument();
    const bag = within(compareTable()).getByText('가방').closest('tr')!;
    expect(within(bag).getByText('3마리')).toBeInTheDocument();
    expect(within(bag).getByText('1마리')).toBeInTheDocument();
  });

  it('마릿수는 천 단위 쉼표로 보인다', () => {
    const bag = Array.from({ length: 1500 }, (_, i) => inst(`f${i}`, crucian.id));
    show(seed({ bag }));
    const row = within(compareTable()).getByText('가방').closest('tr')!;
    expect(within(row).getByText('1,500마리')).toBeInTheDocument();
    expect(within(row).getByText('0마리')).toBeInTheDocument();
    expect(screen.getByText('판매할 물고기').nextSibling).toHaveTextContent('1,500마리');
  });

  it('체크를 해제하면 비교 표와 요약과 확정 버튼의 값이 따라 바뀐다', () => {
    show(seed({ gold: 0, bag: [inst('a', crucian.id), inst('b', carp.id)] }));
    expect(screen.getByText('판매할 물고기').nextSibling).toHaveTextContent('2마리');
    fireEvent.click(screen.getByRole('button', { name: `${carp.name} 판매 해제` }));
    expect(screen.getByText('판매할 물고기').nextSibling).toHaveTextContent('1마리');
    const gold = within(compareTable()).getByText('골드').closest('tr')!;
    expect(within(gold).getByText(`${crucian.price}G`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `판매 (+${crucian.price}G)` })).toBeEnabled();
  });

  it('체크가 없어도 비교 표와 확정 영역의 줄은 그대로 있고 확정 버튼만 막힌다', () => {
    show(seed({ gold: 50, bag: [inst('a', crucian.id)] }));
    fireEvent.click(screen.getByRole('button', { name: `${crucian.name} 판매 해제` }));
    expect(within(compareTable()).getAllByRole('row')).toHaveLength(3); // 머리와 두 줄
    expect(screen.getByText('판매할 물고기').nextSibling).toHaveTextContent('0마리');
    expect(screen.getByText(/판매한 물고기는 되찾을 수 없어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^판매 \(/ })).toBeDisabled();
  });

  it('안내는 두 줄이고 잠근 개체 안내 문단은 없다', () => {
    show(seed({ bag: [inst('a', crucian.id), inst('b', crucian.id, { locked: true })] }));
    const note = screen.getByText(/판매한 물고기는 되찾을 수 없어요/);
    expect(note).toHaveTextContent('판매한 물고기는 되찾을 수 없어요.도감과 명성은 그대로 남아요.');
    expect(screen.queryByText(/잠근 개체 \d+마리/)).toBeNull();
  });

  it('행 소계는 고른 개체의 가격이고 체크 버튼 이름은 판매 선택과 해제다', () => {
    show(seed({ bag: [inst('a', crucian.id), inst('b', carp.id)] }));
    const row = screen.getByText(carp.name).closest('tr')!;
    expect(within(row).getByText(`${carp.price}G`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `${carp.name} 판매 해제` }));
    expect(within(row).getByText('0G')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${carp.name} 판매 선택` })).toBeInTheDocument();
  });

  it('해제한 어종은 빼고 판매 확정이 나머지 개체의 uid를 보낸다', () => {
    const { dispatch } = show(seed({ bag: [inst('a', crucian.id), inst('b', carp.id)] }));
    fireEvent.click(screen.getByRole('button', { name: `${carp.name} 판매 해제` }));
    fireEvent.click(screen.getByRole('button', { name: `판매 (+${crucian.price}G)` }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'sell', uids: ['a'] });
  });

  it('판매를 확정하면 창을 닫고 번 골드를 알린다', () => {
    const { onClose, setToast } = show(seed({ bag: [inst('a', crucian.id)] }), { result: { type: 'sell', gold: 77 } });
    fireEvent.click(screen.getByRole('button', { name: /^판매 \(/ }));
    expect(onClose).toHaveBeenCalled();
    expect(setToast).toHaveBeenCalledWith('물고기를 팔아 77G를 벌었어요!', 'gold');
  });

  it('개체를 펼쳐 하나씩 고르면 그 개체만 빠진다', () => {
    const { dispatch } = show(seed({ bag: [inst('a', crucian.id, { size: 30 }), inst('b', crucian.id, { size: 10 })] }));
    fireEvent.click(screen.getByRole('button', { name: `${crucian.name} 개체 펼치기` }));
    const lines = screen.getAllByRole('button').filter(b => /cm/.test(b.textContent ?? ''));
    fireEvent.click(lines[0]); // 큰 개체가 먼저 나온다
    fireEvent.click(screen.getByRole('button', { name: `판매 (+${crucian.price}G)` }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'sell', uids: ['b'] });
  });

  it('가방이 비면 안내가 보이고 비교 표와 확정 영역의 자리는 그대로이며 판매 버튼은 막힌다', () => {
    show(seed({ gold: 9 }));
    expect(screen.getByText(/가방이 비어 있어요/)).toBeInTheDocument();
    expect(within(compareTable()).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /^판매 \(/ })).toBeDisabled();
  });
});

describe('기운 얻기 탭', () => {
  // 배 5의 기본값: 가장 앞선 해역(인도양)만 꺼짐, 그 앞 해역은 켜짐
  const bag = () => [inSpot('a1', 'pond'), inSpot('a2', 'pond'), inSpot('b1', 'sea'), inSpot('c1', 'indian')];
  const open = (game = seed({ bag: bag() }), opts: Parameters<typeof show>[1] = {}) => {
    const out = show(game, opts);
    fireEvent.click(tab('기운 얻기'));
    return out;
  };
  const rowOf = (spot: SpotId) => screen.getByText(fishIn(spot).name).closest('tr')!;
  const energy = (c = 0, r = 0, e = 0, l = 0): Record<string, number> => ({
    [ENERGY_ITEM_IDS.common]: toStoredEnergy(c), [ENERGY_ITEM_IDS.rare]: toStoredEnergy(r),
    [ENERGY_ITEM_IDS.epic]: toStoredEnergy(e), [ENERGY_ITEM_IDS.legendary]: toStoredEnergy(l),
  });

  it('판매 탭과 같은 표(어종, 등급, 수량)에 체크 열과 생명의 기운 열을 둔다', () => {
    open();
    expect(heads(fishTable())).toEqual(['선택', '어종', '등급', '수량', '생명의 기운']);
  });

  it('비교 표는 현재와 기운 얻기 후 열에 등급별 기운 네 줄을 보이고 괄호만 등급색이다', () => {
    open(seed({ bag: bag(), items: energy(35, 0, 4, 0) }));
    expect(heads(compareTable()).slice(1)).toEqual(['현재', '기운 얻기 후']);
    const rows = within(compareTable()).getAllByRole('row').slice(1);
    expect(rows.map(r => within(r).getAllByRole('cell').map(c => c.textContent))).toEqual([
      ['생명의 기운(일반)', '35', '38'], ['생명의 기운(희귀)', '0', '0'],
      ['생명의 기운(영웅)', '4', '4'], ['생명의 기운(전설)', '0', '0'],
    ]);
    const common = rows[0];
    expect(within(common).getByText('(일반)')).toHaveAttribute('data-rarity', 'common');
    expect(within(common).getByText('생명의 기운').closest('[data-rarity]')).toBeNull();
  });

  it('합계 줄은 얻을 생명의 기운과 +N이고 안내 두 줄이 확정 버튼 위에 있다', () => {
    open();
    expect(screen.getByText('얻을 생명의 기운').nextSibling).toHaveTextContent('+3');
    const note = screen.getByText(/기운을 얻은 물고기는 가방에서 사라져요/);
    expect(note).toHaveTextContent('기운을 얻은 물고기는 가방에서 사라져요.도감과 명성은 그대로 남아요.');
    const confirm = screen.getByRole('button', { name: /^기운 얻기 \(/ });
    expect(note.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('체크 기본값은 게임 규칙을 따른다 — 가장 앞선 해역의 어종은 꺼지고 그 앞 해역은 켜진다', () => {
    open();
    expect(within(rowOf('pond')).getByText('+2')).toBeInTheDocument();
    expect(within(rowOf('sea')).getByText('+1')).toBeInTheDocument();
    expect(within(rowOf('indian')).getByText('0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '기운 얻기 (3마리)' })).toBeEnabled();
  });

  it('확정 버튼의 마릿수는 천 단위 쉼표로 보인다', () => {
    const bag = Array.from({ length: 1500 }, (_, i) => inSpot(`f${i}`, 'pond'));
    show(seed({ bag }));
    fireEvent.click(tab('기운 얻기'));
    expect(screen.getByRole('button', { name: '기운 얻기 (1,500마리)' })).toBeInTheDocument();
  });

  it('확정 버튼은 고른 개체의 uid로 extractEnergy를 보내고 창은 그대로 열려 있다', () => {
    const { dispatch, onClose } = open(seed({ bag: bag() }), { result: { type: 'extract', energy: { common: 30, rare: 0, epic: 0, legendary: 0 } } });
    fireEvent.click(screen.getByRole('button', { name: '기운 얻기 (3마리)' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'extractEnergy', uids: ['a1', 'a2', 'b1'] });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('결과는 메시지 창 한 줄로 알리고 등급별 목록 툴팁을 단다', () => {
    const { setToast } = open(seed({ bag: bag() }), { result: { type: 'extract', energy: { common: 380, rare: 20, epic: 0, legendary: 0 } } });
    fireEvent.click(screen.getByRole('button', { name: '기운 얻기 (3마리)' }));
    expect(setToast).toHaveBeenCalledWith('생명의 기운 40개를 얻었어요!', 'gold', {
      target: '40',
      rows: [{ label: '생명의 기운(일반)', value: '+38' }, { label: '생명의 기운(희귀)', value: '+2' }],
    });
  });

  it('결과의 기운이 소수 첫째 자리이면 소수로 알린다', () => {
    const { setToast } = open(seed({ bag: bag() }), { result: { type: 'extract', energy: { common: 15, rare: 5, epic: 0, legendary: 0 } } });
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

  it('고른 것이 없어도 비교 표 네 줄과 확정 영역은 그대로 있고 확정 버튼만 막힌다', () => {
    open(seed({ bag: [inSpot('c1', 'indian')] }));
    expect(screen.getByRole('button', { name: '기운 얻기 (0마리)' })).toBeDisabled();
    expect(within(compareTable()).getAllByRole('row')).toHaveLength(5);
    expect(screen.getByText('얻을 생명의 기운').nextSibling).toHaveTextContent('+0');
  });

  it('항구에서도 확정할 수 있다', () => {
    const { dispatch } = open(seed({ bag: bag(), location: { kind: 'base', id: 'harbor' } }), { base: 'harbor' });
    fireEvent.click(screen.getByRole('button', { name: '기운 얻기 (3마리)' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'extractEnergy', uids: ['a1', 'a2', 'b1'] });
  });

  it('판매 시설이 있는 거점 밖이면 확정이 막히고 게임 규칙의 거부 사유가 툴팁이다', () => {
    open(seed({ bag: bag(), location: { kind: 'region', id: 'village' } }));
    const button = screen.getByRole('button', { name: '기운 얻기 (3마리)' });
    expect(button).toBeDisabled();
    fireEvent.mouseEnter(button.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('집이나 항구에서만 할 수 있어요.');
  });

  it('잠근 개체 안내 문단은 없고 잠긴 행의 자물쇠 툴팁이 알린다', () => {
    open(seed({ bag: [inSpot('a1', 'pond'), inSpot('a2', 'pond', { locked: true })] }));
    expect(screen.queryByText(/기운 얻기에서 빠져요/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `${fishIn('pond').name} 개체 펼치기` }));
    const lock = document.querySelector('[data-glyph="lock"]')!;
    fireEvent.mouseEnter(lock.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('잠근 개체는 고를 수 없어요.');
  });

  it('합계 줄의 툴팁은 등급별 목록이다', () => {
    const rare = FISH.find(f => f.spot === 'pond' && f.rarity === 'rare')!;
    open(seed({ bag: [inSpot('a1', 'pond'), inst('a2', rare.id)] }));
    fireEvent.mouseEnter(screen.getByText('+2', { selector: 'span.pf-accent' }));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('생명의 기운(일반)');
    expect(tip).toHaveTextContent('생명의 기운(희귀)');
  });

  it('두 탭의 선택은 따로 두고 탭을 오가도 남는다', () => {
    show(seed({ bag: bag() }));
    fireEvent.click(screen.getByRole('button', { name: `${fishIn('pond').name} 판매 해제` }));
    fireEvent.click(tab('기운 얻기'));
    expect(screen.getByRole('button', { name: '기운 얻기 (3마리)' })).toBeInTheDocument(); // 판매 탭의 해제가 번지지 않는다
    fireEvent.click(screen.getByRole('button', { name: `${fishIn('sea').name} 기운 얻기 해제` }));
    fireEvent.click(tab('판매'));
    expect(screen.getByRole('button', { name: `${fishIn('pond').name} 판매 선택` })).toBeInTheDocument();
    fireEvent.click(tab('기운 얻기'));
    expect(screen.getByRole('button', { name: '기운 얻기 (2마리)' })).toBeInTheDocument();
  });
});

describe('기운 얻기 탭의 잠금', () => {
  const lines = (lock: HTMLElement) => {
    fireEvent.mouseEnter(lock.parentElement!);
    return screen.getByRole('tooltip');
  };

  it('증기선 전에는 숨기지 않고 잠긴 탭으로 보이며 눌러도 열리지 않는다', () => {
    show(seed({ boat: COOKING_UNLOCK_BOAT - 1, bag: [inst('a', crucian.id)] }));
    const energy = tab('기운 얻기');
    expect(energy).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(energy);
    expect(tab('판매')).toHaveClass('active');
    expect(screen.getByRole('button', { name: /^판매 \(/ })).toBeInTheDocument();
  });

  it('진행 조건 잠금 툴팁은 구역 항로와 배 단계 두 줄이다', () => {
    show(seed({ boat: COOKING_UNLOCK_BOAT - 1 }));
    const tip = lines(tab('기운 얻기'));
    expect(tip).toHaveTextContent('인도양 항로가 열리면 기운 얻기를 할 수 있어요.');
    expect(tip).toHaveTextContent('인도양 항로는 증기선(5단계)부터 열려요.');
  });

  it('게스트에게는 게스트 잠금이다', () => {
    show(seed({ boat: COOKING_UNLOCK_BOAT }), { guest: true });
    expect(tab('기운 얻기')).toHaveAttribute('aria-disabled', 'true');
    expect(lines(tab('기운 얻기'))).toHaveTextContent('계정을 연결하면 쓸 수 있어요.');
  });

  it('게스트이면서 해금 전이면 게스트 잠금이 먼저다', () => {
    show(seed({ boat: COOKING_UNLOCK_BOAT - 1 }), { guest: true });
    const tip = lines(tab('기운 얻기'));
    expect(tip).toHaveTextContent('계정을 연결하면 쓸 수 있어요.');
    expect(tip).not.toHaveTextContent('항로');
  });

  it('게스트도 판매 탭은 쓸 수 있다', () => {
    show(seed({ bag: [inst('a', crucian.id)] }), { guest: true });
    expect(screen.getByRole('button', { name: /^판매 \(/ })).toBeEnabled();
  });

  it('계정이고 해금했으면 잠기지 않는다', () => {
    show(seed({ boat: COOKING_UNLOCK_BOAT }));
    expect(tab('기운 얻기')).not.toHaveAttribute('aria-disabled');
  });
});

describe('해역별 기운 대상 팝오버', () => {
  const bag = () => [inSpot('a1', 'pond'), inSpot('a2', 'pond'), inSpot('b1', 'sea')];
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

  it('바깥을 누르거나 Esc를 누르면 팝오버만 닫히고 판매 창은 열려 있다', () => {
    const { onClose } = open();
    fireEvent.click(gear());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: '해역별 기운 대상' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(gear());
    fireEvent.pointerDown(screen.getByText('얻을 생명의 기운'));
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
