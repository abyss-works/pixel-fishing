// 메시지 창 오류 자리에 보이는 실패 안내 — 같은 문구는 떠 있는 동안 한 번만 알리고, 시간이 지나면 지운다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAILURE_NOTICE_MS, clearFailureNotice, currentFailureNotice, showFailureNotice } from './failureNotice';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { clearFailureNotice(); vi.useRealTimers(); });

describe('실패 안내', () => {
  it('문구를 보이고 일정 시간 뒤에 지운다', () => {
    expect(showFailureNotice('가')).toBe(true);
    expect(currentFailureNotice()).toBe('가');
    vi.advanceTimersByTime(FAILURE_NOTICE_MS - 1);
    expect(currentFailureNotice()).toBe('가');
    vi.advanceTimersByTime(1);
    expect(currentFailureNotice()).toBeNull();
  });

  it('같은 문구가 떠 있는 동안 다시 오면 새로 알리지 않고 시간만 늘린다', () => {
    expect(showFailureNotice('가')).toBe(true);
    vi.advanceTimersByTime(FAILURE_NOTICE_MS - 10);
    expect(showFailureNotice('가')).toBe(false);
    vi.advanceTimersByTime(20);
    expect(currentFailureNotice()).toBe('가');
    vi.advanceTimersByTime(FAILURE_NOTICE_MS);
    expect(currentFailureNotice()).toBeNull();
  });

  it('다른 문구는 바로 바꿔 보이고 새로 알린다', () => {
    showFailureNotice('가');
    expect(showFailureNotice('나')).toBe(true);
    expect(currentFailureNotice()).toBe('나');
  });

  it('지우면 같은 문구도 다시 새로 알린다', () => {
    showFailureNotice('가');
    clearFailureNotice();
    expect(currentFailureNotice()).toBeNull();
    expect(showFailureNotice('가')).toBe(true);
  });
});
