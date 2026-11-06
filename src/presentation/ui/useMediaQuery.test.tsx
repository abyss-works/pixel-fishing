import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';
import { MOBILE_QUERY, useMobileLayout } from '../layouts/useMobileLayout';

type Listener = () => void;

/** 질의마다 현재 값과 변경 알림을 가진 matchMedia 대역 */
function installMatchMedia(initial: Record<string, boolean>) {
  const state = { ...initial };
  const listeners = new Map<string, Set<Listener>>();
  window.matchMedia = vi.fn((query: string) => ({
    get matches() { return state[query] ?? false; },
    media: query,
    addEventListener: (_: string, fn: Listener) => {
      if (!listeners.has(query)) listeners.set(query, new Set());
      listeners.get(query)!.add(fn);
    },
    removeEventListener: (_: string, fn: Listener) => { listeners.get(query)?.delete(fn); },
  })) as unknown as typeof window.matchMedia;
  return (query: string, value: boolean) => {
    state[query] = value;
    listeners.get(query)?.forEach(fn => fn());
  };
}

const original = window.matchMedia;
afterEach(() => { cleanup(); window.matchMedia = original; });

describe('useMediaQuery', () => {
  it('질의가 맞으면 true, 아니면 false', () => {
    installMatchMedia({ '(pointer: coarse)': true });
    expect(renderHook(() => useMediaQuery('(pointer: coarse)')).result.current).toBe(true);
    expect(renderHook(() => useMediaQuery('(pointer: fine)')).result.current).toBe(false);
  });

  it('화면 조건이 바뀌면 다시 판정한다', () => {
    const set = installMatchMedia({ '(pointer: coarse)': false });
    const { result } = renderHook(() => useMediaQuery('(pointer: coarse)'));
    expect(result.current).toBe(false);
    act(() => set('(pointer: coarse)', true));
    expect(result.current).toBe(true);
  });

  it('matchMedia가 없는 환경에서는 false', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    expect(renderHook(() => useMediaQuery('(pointer: coarse)')).result.current).toBe(false);
  });
});

describe('useMobileLayout', () => {
  it('세로 화면이고 폭이 600px 미만인 질의로 판정한다', () => {
    expect(MOBILE_QUERY).toBe('(orientation: portrait) and (max-width: 599px)');
    const set = installMatchMedia({ [MOBILE_QUERY]: true });
    const { result } = renderHook(() => useMobileLayout());
    expect(result.current).toBe(true);
    act(() => set(MOBILE_QUERY, false));
    expect(result.current).toBe(false);
  });
});
