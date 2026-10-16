// 조우 창 — 들어가며 → 승부(10회 시도·7히트 성공·4실패 탈락) → 토벌/놓침의 UI 구동.
// 판정 규칙은 순수 로직에서 검증하고, 여기서는 단계 전환·타이머·입력·결과 확정을 본다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import EncounterModal from './EncounterModal';
import { selectEncounter } from '../../../../features/bounty/model/challenge';
import { newState } from '../../../../game/rules/logic';
import { resetKeyScopes } from '../../../ui/hotkeys';

beforeEach(() => { vi.useFakeTimers(); resetKeyScopes(); });
afterEach(() => { cleanup(); vi.useRealTimers(); resetKeyScopes(); });

const show = () => {
  const onResolve = vi.fn();
  const onClose = vi.fn();
  const data = { ...selectEncounter(newState(), 'pacific-named-megalodon')!, sweepMs: 1000 };
  render(<EncounterModal data={data} onResolve={onResolve} onClose={onClose} />);
  return { onResolve, onClose };
};
const enter = () => fireEvent.click(screen.getByRole('button', { name: '조우' }));

describe('EncounterModal', () => {
  it('들어가며 — 목격담과 그림자, 이름은 부르지 않는다. 조우를 눌러야 바가 돈다', () => {
    show();
    expect(screen.getByText(/같은 그림자를 보고했다/)).toBeInTheDocument();
    expect(screen.getByText('그림자가 돌아선다.')).toBeInTheDocument();
    expect(screen.queryByText('메갈로돈')).toBeNull();
    expect(screen.queryByRole('button', { name: '챔질!' })).toBeNull();
    enter();
    expect(screen.getByRole('button', { name: '챔질!' })).toBeInTheDocument();
  });

  it('중앙 챔질 7히트면 이름이 드러나고 토벌 버튼이 결과를 보낸다', () => {
    const { onResolve } = show();
    enter();
    for (let i = 0; i < 7; i++) {
      act(() => { vi.advanceTimersByTime(500); }); // 정중앙 = GOOD 이상
      fireEvent.click(screen.getByRole('button', { name: '챔질!' }));
    }
    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByText('메갈로돈')).toBeInTheDocument();
    expect(screen.getByText('메갈로돈이 수면 위로 떠올랐다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '토벌' }));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({ hits: 7, misses: 0, success: true });
  });

  it('스페이스바도 챔질이 된다', () => {
    show();
    enter();
    for (let i = 0; i < 7; i++) {
      act(() => { vi.advanceTimersByTime(500); });
      fireEvent.keyDown(document.body, { code: 'Space' });
    }
    expect(screen.getByRole('button', { name: '토벌' })).toBeInTheDocument();
  });

  it('챔질 없이 두면 시간 초과 실패가 쌓여 4번째에 탈락하고 즉시 실패를 보낸다', () => {
    const { onResolve, onClose } = show();
    enter();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({ hits: 0, misses: 4, success: false });
    expect(screen.getByText(/흔적은 아직 남아 있다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '돌아가기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('닫기 X와 Esc는 같은 출구다', () => {
    const { onClose } = show();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
