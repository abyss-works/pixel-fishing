// 조선소 — 구매 버튼은 스크롤 본문 밖(하단 고정 자리)에 있다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import FacilityModal from './FacilityModal';
import { registerNoticeSink } from '../../../../features/display/model/toastPolicy';
import type { SystemNoticeInput } from '../../../../features/display/model/toastPolicy';
import { BOATS, MAX_BOAT, newState } from '../../../../game/rules/logic';
import { AUTO_ENERGY_BOAT } from '../../../../game/content/cooking';
import { fmtGold, fmtNum } from '../../../ui/format';
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

  it('마지막 배는 여는 해역과 함께 목록에 나오고 구매 조건을 보인다', () => {
    const last = BOATS[MAX_BOAT - 1];
    render(<FacilityModal sellBonus={0} panel="boat" game={{ ...newState(), boat: MAX_BOAT - 1, gold: last.price, fame: last.fameReq }}
                          dispatch={vi.fn()} setToast={() => {}} onClose={() => {}} />);
    const ladder = screen.getByRole('list', { name: '배 목록' });
    expect(within(ladder).getByText(last.name)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `구매 (-${fmtGold(last.price)})` })).toBeEnabled();
    const row = screen.getByText('새 해역').closest('tr')!;
    expect(row).toHaveTextContent('새 해역아조레스 해령');
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

  it.each([
    ['길드 보너스로 배 기본 상한을 넘겨 보유한 상태', 550],
    ['다음 배 기본 상한보다 많이 보유한 상태', 1_200],
  ])('%s에서도 비교 표는 현재 배 기본 상한과 양수 증가량을 보인다', (_, count) => {
    const bag = Array.from({ length: count }, (_, i) => ({
      uid: `f${i}`, fishId: 'carp', form: 'normal' as const, size: 20,
      caughtAt: null, spot: null, judgment: null, locked: false,
    }));
    const cur = BOATS[2];
    const next = BOATS[3];
    render(
      <FacilityModal sellBonus={0} panel="boat" game={{ ...newState(), boat: cur.tier, bag }}
                     dispatch={vi.fn()} setToast={() => {}} onClose={() => {}} />,
    );
    const row = screen.getByText('가방 상한').closest('tr')!;
    expect(row).toHaveTextContent(`${fmtNum(cur.bagCap)}마리`);
    expect(row).toHaveTextContent(`${fmtNum(next.bagCap)}마리`);
    expect(row).toHaveTextContent(`+${fmtNum(next.bagCap - cur.bagCap)}`);
    expect(row.textContent).not.toContain('+-');
  });

  it('배 구매에 성공해도 창을 닫지 않고 알림에 boat-buy 교체 키를 싣는다', () => {
    const dispatch = vi.fn(() => ({ status: 'ok' as const, state: { ...newState(), boat: 1 }, result: { type: 'none' as const } }));
    const onClose = vi.fn();
    const structured = vi.fn<(input: SystemNoticeInput) => void>();
    const setToast = registerNoticeSink(vi.fn(), structured);
    render(
      <FacilityModal sellBonus={0} panel="boat" game={{ ...newState(), gold: BOATS[0].price, fame: BOATS[0].fameReq }}
                     dispatch={dispatch} setToast={setToast} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: `구매 (-${fmtGold(BOATS[0].price)})` }));
    expect(onClose).not.toHaveBeenCalled();
    expect(structured).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'facility.boatBought',
      replaceKey: 'boat-buy',
    }));
  });
});
