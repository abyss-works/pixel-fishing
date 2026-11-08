// 조선소 — 구매 버튼은 스크롤 본문 밖(하단 고정 자리)에 있다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import FacilityModal from './FacilityModal';
import { newState } from '../../../../game/rules/logic';
import { resetKeyScopes } from '../../../ui/hotkeys';

afterEach(() => { cleanup(); resetKeyScopes(); });

describe('조선소', () => {
  it('구매 버튼은 스크롤 본문 밖에 있고 buyBoat를 보낸다', () => {
    const dispatch = vi.fn(() => ({ status: 'ok' as const, state: { ...newState(), boat: 1 }, result: { type: 'none' as const } }));
    render(<FacilityModal panel="boat" game={{ ...newState(), gold: 1_000_000, fame: 1_000_000 }} dispatch={dispatch} setToast={() => {}} onClose={() => {}} />);
    const button = screen.getByRole('button', { name: /^구매 \(-/ });
    expect(button.closest('.pf-vscroll')).toBeNull();
    fireEvent.click(button);
    expect(dispatch).toHaveBeenCalledWith({ type: 'buyBoat' });
  });
});
