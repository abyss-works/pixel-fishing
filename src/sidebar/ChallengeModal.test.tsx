// 챌린지 모달 — 10회 시도·7히트 성공·4실패 탈락의 UI 구동.
// 판정 규칙 자체는 challenge.test.ts가 맡고, 여기는 타이머·입력·종료만 본다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import ChallengeModal from './ChallengeModal';
import { resetKeyScopes } from '../hotkeys';

beforeEach(() => { vi.useFakeTimers(); resetKeyScopes(); });
afterEach(() => { cleanup(); vi.useRealTimers(); resetKeyScopes(); });

const show = (onFinish = vi.fn()) => {
  const onClose = vi.fn();
  render(<ChallengeModal targetName="메갈로돈" sweepMs={1000} onFinish={onFinish} onClose={onClose} />);
  return { onFinish, onClose };
};

describe('ChallengeModal', () => {
  it('중앙 챔질 7히트면 성공으로 끝난다', () => {
    const { onFinish } = show();
    for (let i = 0; i < 7; i++) {
      act(() => { vi.advanceTimersByTime(500); }); // 정중앙 = GOOD 이상
      fireEvent.click(screen.getByRole('button', { name: '챔질!' }));
    }
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith({ hits: 7, misses: 0, success: true });
    expect(screen.getByText(/포획/)).toBeInTheDocument();
  });

  it('스페이스바도 챔질이 된다', () => {
    const { onFinish } = show();
    for (let i = 0; i < 7; i++) {
      act(() => { vi.advanceTimersByTime(500); });
      fireEvent.keyDown(document.body, { code: 'Space' });
    }
    expect(onFinish).toHaveBeenCalledWith({ hits: 7, misses: 0, success: true });
  });

  it('챔질 없이 두면 시간 초과 실패가 쌓여 4번째에 탈락한다', () => {
    const { onFinish } = show();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith({ hits: 0, misses: 4, success: false });
    expect(screen.getByText(/유지된다/)).toBeInTheDocument();
  });

  it('닫기를 누르면 onClose가 불린다', () => {
    const { onClose } = show();
    act(() => { vi.advanceTimersByTime(4000); });
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
