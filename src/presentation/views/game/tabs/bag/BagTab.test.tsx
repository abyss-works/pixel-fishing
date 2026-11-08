// 가방 탭 — 전시대 선반(칸 3개)과 진열·회수 버튼이 exhibit 액션으로 이어지는지 고정한다.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import BagTab, { EXHIBIT_UI_ENABLED } from './BagTab';
import { resetBagView } from './bagView';
import { newState, saleBonusOf, sellableValue } from '../../../../../game/rules/logic';
import { fmtGold } from '../../../../ui/format';
import type { FishInstance, GameState } from '../../../../../game/rules/logic';

afterEach(cleanup);
beforeEach(resetBagView);

const inst = (uid: string): FishInstance =>
  ({ uid, fishId: 'carp', form: 'normal', size: 20, caughtAt: null, spot: null, judgment: null, locked: false });
const game = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

function show(g: GameState) {
  const dispatch = vi.fn(() => ({ status: 'ok' as const, state: g, result: { type: 'none' as const } }));
  const setToast = vi.fn();
  render(<BagTab sellBonus={0} game={g} dispatch={dispatch} setToast={setToast} />);
  return { dispatch, setToast };
}

// 전시대 화면은 배포 보류 중이라 꺼져 있다 — 다시 켜면 그대로 검증된다
describe.skipIf(!EXHIBIT_UI_ENABLED)('BagTab — 전시대', () => {
  it('칸 3개를 보이고, 전시 개체의 회수는 slot null 액션을 보낸다', () => {
    const g = game();
    g.exhibit[1] = inst('e');
    const { dispatch } = show(g);
    expect(screen.getAllByText('빈 칸')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /회수$/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'exhibit', uid: 'e', slot: null });
  });

  it('가방 개체의 진열 버튼은 가장 앞의 빈 칸으로 보낸다', () => {
    const g = game({ bag: [inst('a')] });
    g.exhibit[0] = inst('e');
    const { dispatch } = show(g);
    fireEvent.click(screen.getByRole('button', { name: /개체 펼치기$/ }));
    fireEvent.click(screen.getByRole('button', { name: /진열$/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'exhibit', uid: 'a', slot: 1 });
  });

  it('전시대가 다 차면 진열은 요청 없이 안내만 한다', () => {
    const g = game({ bag: [inst('a')], exhibit: [inst('x'), inst('y'), inst('z')] });
    const { dispatch, setToast } = show(g);
    fireEvent.click(screen.getByRole('button', { name: /개체 펼치기$/ }));
    fireEvent.click(screen.getByRole('button', { name: /진열$/ }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(setToast).toHaveBeenCalledTimes(1);
  });
});

describe('BagTab - 판매 가능 금액', () => {
  const owned = (): GameState => game({ bag: [inst('a'), inst('b')] });

  it('길드 판매가 보너스가 없으면 금액 하나만 보인다', () => {
    render(<BagTab sellBonus={0} game={owned()} dispatch={vi.fn()} setToast={vi.fn()} />);
    const base = sellableValue(owned());
    const note = within(screen.getByText(/판매 가능 금액은/));
    expect(note.getByText(fmtGold(base))).toBeInTheDocument();
    expect(note.queryByText(/판매가 보너스/)).not.toBeInTheDocument();
  });

  it('길드 판매가 보너스가 있으면 기본 금액, 증감, 합계 내역을 판매 화면과 같은 값으로 보인다', () => {
    const g = owned();
    const base = sellableValue(g);
    const bonus = saleBonusOf(base, 0.5);
    render(<BagTab sellBonus={0.5} game={g} dispatch={vi.fn()} setToast={vi.fn()} />);
    expect(within(screen.getByText(/판매 가능 금액은/)).getByText(`기본 금액 ${fmtGold(base)}, 판매가 보너스 +${fmtGold(bonus)}, 합계 ${fmtGold(base + bonus)}`)).toBeInTheDocument();
  });
});
