// @vitest-environment jsdom
// 플로팅 토스트 표시 여부 저장소 — 기기별 표시 설정(localStorage). 세이브·서버와 무관하다.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TOAST_ENABLED_KEY, getToastEnabled, loadToastEnabled, resetToastEnabled, setToastEnabled,
  subscribeToastEnabled,
} from './toastEnabled';

describe('플로팅 토스트 표시 저장소', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    resetToastEnabled();
  });

  it('저장값이 없으면 켜짐(true)이다', () => {
    expect(loadToastEnabled()).toBe(true);
    expect(getToastEnabled()).toBe(true);
  });

  it('선택은 기기에 남고 구독자에게 알린다', () => {
    let calls = 0;
    const off = subscribeToastEnabled(() => { calls++; });
    setToastEnabled(false);
    expect(getToastEnabled()).toBe(false);
    expect(localStorage.getItem(TOAST_ENABLED_KEY)).toBe('0');
    expect(loadToastEnabled()).toBe(false);
    setToastEnabled(false); // 같은 값은 알리지 않는다
    expect(calls).toBe(1);
    setToastEnabled(true);
    expect(localStorage.getItem(TOAST_ENABLED_KEY)).toBe('1');
    expect(loadToastEnabled()).toBe(true);
    expect(calls).toBe(2);
    off();
  });

  it('알 수 없는 저장값은 켜짐으로 읽는다', () => {
    localStorage.setItem(TOAST_ENABLED_KEY, 'x');
    expect(loadToastEnabled()).toBe(true);
  });

  it('저장소가 막혀도 이번 세션에는 적용된다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    setToastEnabled(false);
    expect(getToastEnabled()).toBe(false);
  });

  it('저장소를 읽을 수 없으면 켜짐이다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(loadToastEnabled()).toBe(true);
  });
});
