import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readInitialCanvasCover, resetCanvasCover, setCanvasCover, useCanvasCover } from './canvasCover';

beforeEach(() => {
  localStorage.clear();
  resetCanvasCover();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetCanvasCover();
  localStorage.clear();
});

describe('canvasCover 운영 가드 및 저장소 동작', () => {
  it('비활성(운영) 가드에서는 localStorage를 읽지 않고 false를 반환한다', () => {
    localStorage.setItem('pf-canvas-cover', '1');
    const getSpy = vi.spyOn(Storage.prototype, 'getItem');
    expect(readInitialCanvasCover(false)).toBe(false);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('활성(비운영) 가드에서는 localStorage 값에 따라 초기 상태를 읽고 토글을 구독한다', () => {
    localStorage.setItem('pf-canvas-cover', '1');
    expect(readInitialCanvasCover(true)).toBe(true);

    const { result } = renderHook(() => useCanvasCover());
    expect(result.current).toBe(false);
    act(() => { setCanvasCover(true); });
    expect(result.current).toBe(true);
    expect(localStorage.getItem('pf-canvas-cover')).toBe('1');
    act(() => { setCanvasCover(false); });
    expect(result.current).toBe(false);
    expect(localStorage.getItem('pf-canvas-cover')).toBeNull();
  });
});
