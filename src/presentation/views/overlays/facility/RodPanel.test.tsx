// 낚싯대 강화 — 왼쪽 단계 목록(지난 단계, 지금, 다음, 잠김)과 오른쪽 비교 표, 강화 버튼.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import FacilityModal from './FacilityModal';
import { newState } from '../../../../game/rules/logic';
import { upgradeCost } from '../../../../game/rules/balance';
import { resetKeyScopes } from '../../../ui/hotkeys';
import { fmtGold } from '../../../ui/format';

afterEach(() => { cleanup(); resetKeyScopes(); });

const show = (rod: number, gold: number) => {
  const dispatch = vi.fn(() => ({ status: 'ok' as const, state: newState(), result: { type: 'none' as const } }));
  render(<FacilityModal panel="rod" game={{ ...newState(), rod, gold }} dispatch={dispatch} setToast={() => {}} onClose={() => {}} />);
  return { dispatch };
};

describe('낚싯대 강화', () => {
  it('단계 목록은 지난 두 단계부터 일곱 행이고 지금 행과 다음 행의 강화 비용을 보인다', () => {
    show(12, 0);
    const rows = within(screen.getByRole('list', { name: '낚싯대 단계' })).getAllByRole('listitem');
    expect(rows.map(r => r.textContent?.match(/Lv\.\d+/)?.[0])).toEqual(['Lv.10', 'Lv.11', 'Lv.12', 'Lv.13', 'Lv.14', 'Lv.15', 'Lv.16']);
    expect(rows[2]).toHaveAttribute('aria-current', 'step');
    expect(rows[2]).toHaveTextContent('지금');
    expect(rows[3]).toHaveTextContent(fmtGold(upgradeCost(12)));
  });

  it('골드가 모자라면 강화 버튼이 막히고 이유는 버튼 툴팁이다', () => {
    show(3, 0);
    const button = screen.getByRole('button', { name: `강화 (-${fmtGold(upgradeCost(3))})` });
    expect(button).toBeDisabled();
    fireEvent.mouseEnter(button.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/골드가 부족해요/);
  });

  it('강화 버튼은 upgradeRod를 보낸다', () => {
    const { dispatch } = show(3, upgradeCost(3));
    fireEvent.click(screen.getByRole('button', { name: `강화 (-${fmtGold(upgradeCost(3))})` }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'upgradeRod' });
  });
});
