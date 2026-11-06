// 미니맵 표시 여부 저장소 — 기기별 표시 설정(localStorage). 세이브·서버와 무관하다.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MINIMAP_VISIBLE_KEY, getMinimapVisible, loadMinimapVisible, resetMinimapVisible, setMinimapVisible,
  subscribeMinimapVisible,
} from './minimapVisible';

describe('미니맵 표시 저장소', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    resetMinimapVisible();
  });

  it('저장값이 없으면 보인다', () => {
    expect(loadMinimapVisible()).toBe(true);
    expect(getMinimapVisible()).toBe(true);
  });

  it('선택은 기기에 남고 구독자에게 알린다', () => {
    let calls = 0;
    const off = subscribeMinimapVisible(() => { calls++; });
    setMinimapVisible(false);
    expect(getMinimapVisible()).toBe(false);
    expect(localStorage.getItem(MINIMAP_VISIBLE_KEY)).toBe('0');
    expect(loadMinimapVisible()).toBe(false);
    setMinimapVisible(false); // 같은 값은 알리지 않는다
    expect(calls).toBe(1);
    setMinimapVisible(true);
    expect(localStorage.getItem(MINIMAP_VISIBLE_KEY)).toBe('1');
    expect(loadMinimapVisible()).toBe(true);
    expect(calls).toBe(2);
    off();
  });

  it('알 수 없는 저장값은 보임으로 읽는다', () => {
    localStorage.setItem(MINIMAP_VISIBLE_KEY, 'x');
    expect(loadMinimapVisible()).toBe(true);
  });

  it('저장소가 막혀도 이번 세션에는 적용된다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    setMinimapVisible(false);
    expect(getMinimapVisible()).toBe(false);
  });

  it('저장소를 읽을 수 없으면 보임이다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(loadMinimapVisible()).toBe(true);
  });
});
