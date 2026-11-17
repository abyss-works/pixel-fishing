// 조선소 — 구매 버튼은 스크롤 본문 밖(하단 고정 자리)에 있다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import FacilityModal from './FacilityModal';
import { BOATS, MAX_BOAT, newState } from '../../../../game/rules/logic';
import { AUTO_ENERGY_BOAT } from '../../../../game/content/cooking';
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

  it('다음 배가 자동 기운 얻기 배일 때만 그 효과 설명이 나온다', () => {
    const effect = /가방이 가득 차면 놓아줄 물고기 가운데/;
    const open = (boat: number) => render(
      <FacilityModal sellBonus={0} panel="boat" game={{ ...newState(), boat }} dispatch={vi.fn()} setToast={() => {}} onClose={() => {}} />);
    open(AUTO_ENERGY_BOAT - 1);
    expect(screen.getByText(effect)).toBeInTheDocument();
    cleanup();
    open(AUTO_ENERGY_BOAT - 2);
    expect(screen.queryByText(effect)).toBeNull();
  });

  it('자동 기운 얻기 배를 이미 가졌으면 최고 배 안내에도 효과 설명이 나온다', () => {
    render(<FacilityModal sellBonus={0} panel="boat" game={{ ...newState(), boat: MAX_BOAT }} dispatch={vi.fn()} setToast={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/가방이 가득 차면 놓아줄 물고기 가운데/)).toBeInTheDocument();
  });
});
