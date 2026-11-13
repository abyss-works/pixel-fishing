// 조선소 — 구매 버튼은 스크롤 본문 밖(하단 고정 자리)에 있다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import FacilityModal from './FacilityModal';
import { BOATS, MAX_BOAT, newState } from '../../../../game/rules/logic';
import { fmtGold } from '../../../ui/format';
import { resetKeyScopes } from '../../../ui/hotkeys';

afterEach(() => { cleanup(); resetKeyScopes(); });

describe('조선소', () => {
  it('구매 버튼은 스크롤 본문 밖에 있고 buyBoat를 보낸다', () => {
    const dispatch = vi.fn(() => ({ status: 'ok' as const, state: { ...newState(), boat: 1 }, result: { type: 'none' as const } }));
    render(<FacilityModal sellBonus={0} panel="boat" game={{ ...newState(), gold: 1_000_000, fame: 1_000_000 }} dispatch={dispatch} setToast={() => {}} onClose={() => {}} />);
    const button = screen.getByRole('button', { name: /^구매 \(-/ });
    expect(button.closest('.pf-vscroll')).toBeNull();
    fireEvent.click(button);
    expect(dispatch).toHaveBeenCalledWith({ type: 'buyBoat' });
  });

  it('마지막 배는 새 해역 없이 목록에 나오고 구매 조건을 보인다', () => {
    const last = BOATS[MAX_BOAT - 1];
    render(<FacilityModal sellBonus={0} panel="boat" game={{ ...newState(), boat: MAX_BOAT - 1, gold: last.price, fame: last.fameReq }}
                          dispatch={vi.fn()} setToast={() => {}} onClose={() => {}} />);
    const ladder = screen.getByRole('list', { name: '배 목록' });
    expect(within(ladder).getByText(last.name)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `구매 (-${fmtGold(last.price)})` })).toBeEnabled();
    const row = screen.getByText('새 해역').closest('tr')!;
    expect(row).toHaveTextContent('새 해역없음');
  });
});
