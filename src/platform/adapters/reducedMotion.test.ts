import { afterEach, describe, expect, it, vi } from 'vitest';
import { getReducedMotion, subscribeReducedMotion } from './reducedMotion';

function stubMatchMedia(initial: boolean) {
  const listeners = new Set<() => void>();
  const list = {
    matches: initial,
    addEventListener: vi.fn((_: string, l: () => void) => { listeners.add(l); }),
    removeEventListener: vi.fn((_: string, l: () => void) => { listeners.delete(l); }),
  };
  const matchMedia = vi.fn(() => list);
  vi.stubGlobal('window', { matchMedia });
  return {
    matchMedia,
    list,
    listeners,
    set(next: boolean) { list.matches = next; for (const l of [...listeners]) l(); },
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('동작 축소 판정', () => {
  it('동작 축소 질의 결과를 그대로 돌려준다', () => {
    const m = stubMatchMedia(true);
    expect(getReducedMotion()).toBe(true);
    expect(m.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    m.set(false);
    expect(getReducedMotion()).toBe(false);
  });

  it('변경 알림을 구독하고 해제한다', () => {
    const m = stubMatchMedia(false);
    const listener = vi.fn();
    const off = subscribeReducedMotion(listener);
    m.set(true);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    m.set(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(m.listeners.size).toBe(0);
  });

  it('matchMedia가 없는 환경에서는 false이고 구독은 아무 일도 하지 않는다', () => {
    vi.stubGlobal('window', {});
    expect(getReducedMotion()).toBe(false);
    expect(() => subscribeReducedMotion(() => {})()).not.toThrow();
  });

  it('window가 없는 환경에서도 false다', () => {
    expect(getReducedMotion()).toBe(false);
  });
});
