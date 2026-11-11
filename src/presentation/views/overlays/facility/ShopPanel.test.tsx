// 미끼 상점 — 정비 패널 골격(좌 목록 · 우 상세). 할인이 있으면 정가에 취소선을 긋고 할인가를 보이며,
// 확정 버튼의 금액은 실제 차감액(baitCost)과 같다.
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import FacilityModal from './FacilityModal';
import { newState, baitCost } from '../../../../game/rules/logic';
import { BAITS } from '../../../../game/content/baits';
import { ARTIFACTS } from '../../../../game/content/artifacts';
import type { Artifact } from '../../../../game/content/artifacts';
import { resetKeyScopes } from '../../../ui/hotkeys';
import { fmtGold } from '../../../ui/format';

afterEach(() => { cleanup(); resetKeyScopes(); });

// 미끼값 효과를 가진 유물은 지금 콘텐츠에 없다. 할인 경로는 합성 유물을 보유 유물 표에 잠시 더해 검증한다
const discountArtifact: Artifact = { ...ARTIFACTS.find(a => a.id === 'varuna-scale')!, id: 'test-bait-discount', effects: { baitDiscount: 0.25 }, cook: undefined };
beforeAll(() => { (ARTIFACTS as Artifact[]).push(discountArtifact); });
afterAll(() => { (ARTIFACTS as Artifact[]).splice((ARTIFACTS as Artifact[]).indexOf(discountArtifact), 1); });

const show = (artifacts: string[] = []) => {
  const dispatch = vi.fn(() => ({ status: 'ok' as const, state: newState(), result: { type: 'none' as const } }));
  const game = { ...newState(), gold: 100_000, artifacts };
  render(<FacilityModal sellBonus={0} panel="shop" game={game} dispatch={dispatch} setToast={() => {}} onClose={() => {}} />);
  return { dispatch, game };
};

describe('미끼 상점', () => {
  it('할인이 없으면 정가만 보이고 취소선이 없다', () => {
    show();
    expect(screen.queryByLabelText(/^정가/)).toBeNull();
    expect(screen.getByRole('button', { name: `구매 (-${fmtGold(BAITS[0].price)})` })).toBeInTheDocument();
  });

  it('구매 버튼은 스크롤 본문 밖(하단 고정 자리)에 있다', () => {
    show();
    const button = screen.getByRole('button', { name: `구매 (-${fmtGold(BAITS[0].price)})` });
    expect(button.closest('.pf-vscroll')).toBeNull();
  });

  it('할인 유물이 있으면 정가에 취소선을 긋고 할인가와 할인율을 보인다', () => {
    const { game } = show([discountArtifact.id]);
    const rare = BAITS[1];
    fireEvent.click(screen.getByRole('option', { name: new RegExp(rare.name) }));
    expect(screen.getAllByLabelText(`정가 ${fmtGold(rare.price)}`).length).toBeGreaterThan(0);
    expect(screen.getByText(/미끼값/)).toBeInTheDocument();
    const unit = baitCost(game, rare.price, 1);
    expect(screen.getByRole('button', { name: `구매 (-${fmtGold(unit)})` })).toBeInTheDocument();
  });

  it('목록에서 고르고 수량을 올려 구입하면 그 미끼·수량으로 보낸다', () => {
    const { dispatch } = show();
    const rare = BAITS[1];
    fireEvent.click(screen.getByRole('option', { name: new RegExp(rare.name) }));
    expect(screen.getByRole('option', { name: new RegExp(rare.name) })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: `${rare.name} 수량 증가` }));
    fireEvent.click(screen.getByRole('button', { name: `구매 (-${fmtGold(rare.price * 2)})` }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'buyBait', bait: rare.id, count: 2 });
  });
});
