// 판매 창 회귀 — 어종 선택 표를 공용으로 뺀 뒤에도 판매 창의 열 이름, 체크, 소계, 확정 동작이 같다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FISH, newState } from '../../../../game/rules/logic';
import type { FishInstance } from '../../../../game/rules/logic';
import { resetBagView } from '../../game/tabs/bag/bagView';
import { resetKeyScopes } from '../../../ui/hotkeys';
import FacilityModal from './FacilityModal';

afterEach(() => { cleanup(); resetKeyScopes(); resetBagView(); });

const crucian = FISH.find(f => f.id === 'crucian')!;
const carp = FISH.find(f => f.id === 'carp')!;
const inst = (uid: string, fishId: string, over: Partial<FishInstance> = {}): FishInstance =>
  ({ uid, fishId, form: 'normal', size: 20, caughtAt: null, spot: null, judgment: null, locked: false, ...over });

function show(bag: FishInstance[]) {
  const dispatch = vi.fn(() => ({ status: 'ok' as const, state: newState(), result: { type: 'sell' as const, gold: 0 } }));
  const setToast = vi.fn();
  render(<FacilityModal panel="sell" sellBonus={0} game={{ ...newState(), bag }} dispatch={dispatch} setToast={setToast} onClose={() => {}} />);
  return { dispatch, setToast };
}

describe('판매 창', () => {
  it('열 이름은 판매, 어종, 등급, 수량, 소계다', () => {
    show([inst('a', crucian.id)]);
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['판매', '어종', '등급', '수량', '소계']);
  });

  it('행 소계는 고른 개체의 가격이고 체크 버튼 이름은 판매 선택과 해제다', () => {
    show([inst('a', crucian.id), inst('b', carp.id)]);
    const row = screen.getByText(carp.name).closest('tr')!;
    expect(within(row).getByText(`${carp.price}G`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `${carp.name} 판매 해제` }));
    expect(within(row).getByText('0G')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${carp.name} 판매 선택` })).toBeInTheDocument();
  });

  it('해제한 어종은 빼고 판매 확정이 나머지 개체의 uid를 보낸다', () => {
    const { dispatch } = show([inst('a', crucian.id), inst('b', carp.id)]);
    fireEvent.click(screen.getByRole('button', { name: `${carp.name} 판매 해제` }));
    fireEvent.click(screen.getByRole('button', { name: `판매 (+${crucian.price}G)` }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'sell', uids: ['a'] });
  });

  it('잠근 개체는 팔리지 않는다는 안내가 확정 영역에 보인다', () => {
    show([inst('a', crucian.id), inst('b', crucian.id, { locked: true })]);
    expect(screen.getByText(/잠근 개체 1마리는 팔리지 않아요/)).toBeInTheDocument();
  });

  it('개체를 펼쳐 하나씩 고르면 그 개체만 빠진다', () => {
    const { dispatch } = show([inst('a', crucian.id, { size: 30 }), inst('b', crucian.id, { size: 10 })]);
    fireEvent.click(screen.getByRole('button', { name: `${crucian.name} 개체 펼치기` }));
    const lines = screen.getAllByRole('button').filter(b => /cm/.test(b.textContent ?? ''));
    fireEvent.click(lines[0]); // 큰 개체가 먼저 나온다
    fireEvent.click(screen.getByRole('button', { name: `판매 (+${crucian.price}G)` }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'sell', uids: ['b'] });
  });

  it('가방이 비면 안내만 보이고 판매 버튼은 없다', () => {
    show([]);
    expect(screen.getByText(/가방이 비어 있어요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^판매 \(/ })).toBeNull();
  });
});
