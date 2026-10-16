// 미끼 상점 — 정비 패널 골격(좌 목록 · 우 상세). 할인이 있으면 정가에 취소선을 긋고 할인가를 보이며,
// 확정 버튼의 금액은 실제 차감액(baitCost)과 같다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import FacilityModal from './FacilityModal';
import { newState, baitCost } from '../../../../game/rules/logic';
import { BAITS } from '../../../../game/content/baits';
import { resetKeyScopes } from '../../../ui/hotkeys';
import { fmtGold } from '../../../ui/format';

afterEach(() => { cleanup(); resetKeyScopes(); });

const show = (artifacts: string[] = []) => {
  const dispatch = vi.fn(() => ({ status: 'ok' as const, state: newState(), result: { type: 'none' as const } }));
  const game = { ...newState(), gold: 100_000, artifacts };
  render(<FacilityModal panel="shop" game={game} dispatch={dispatch} setToast={() => {}} onClose={() => {}} />);
  return { dispatch, game };
};

describe('미끼 상점', () => {
  it('할인이 없으면 정가만 보이고 취소선이 없다', () => {
    show();
    expect(screen.queryByLabelText(/^정가/)).toBeNull();
    expect(screen.getByRole('button', { name: `구입하기 (-${fmtGold(BAITS[0].price)})` })).toBeInTheDocument();
  });

  it('할인 유물이 있으면 정가에 취소선을 긋고 할인가와 할인율을 보인다', () => {
    const { game } = show(['varuna-scale']);
    const rare = BAITS[1];
    fireEvent.click(screen.getByRole('option', { name: new RegExp(rare.name) }));
    expect(screen.getAllByLabelText(`정가 ${fmtGold(rare.price)}`).length).toBeGreaterThan(0);
    expect(screen.getByText(/할인/)).toBeInTheDocument();
    const unit = baitCost(game, rare.price, 1);
    expect(screen.getByRole('button', { name: `구입하기 (-${fmtGold(unit)})` })).toBeInTheDocument();
  });

  it('목록에서 고르고 수량을 올려 구입하면 그 미끼·수량으로 보낸다', () => {
    const { dispatch } = show();
    const rare = BAITS[1];
    fireEvent.click(screen.getByRole('option', { name: new RegExp(rare.name) }));
    expect(screen.getByRole('option', { name: new RegExp(rare.name) })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: `${rare.name} 수량 증가` }));
    fireEvent.click(screen.getByRole('button', { name: `구입하기 (-${fmtGold(rare.price * 2)})` }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'buyBait', bait: rare.id, count: 2 });
  });
});
