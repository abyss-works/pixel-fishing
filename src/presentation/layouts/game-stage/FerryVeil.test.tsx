// 여객선 덮개는 효과가 다시 실행돼도 이동 한 번에 onSurface, onMove, onDone을 각각 한 번만 부른다.
import { StrictMode } from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import FerryVeil from './FerryVeil';
import { windowHostRef } from '../../ui/windowLayer';

function stubMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); window.matchMedia = originalMatchMedia; });

function mount() {
  const onSurface = vi.fn();
  const onMove = vi.fn(() => Promise.resolve());
  const onDone = vi.fn();
  const view = render(<StrictMode><FerryVeil onSurface={onSurface} onMove={onMove} onDone={onDone} /></StrictMode>);
  return { onSurface, onMove, onDone, view };
}

describe('FerryVeil 이동 1회 보장', () => {
  for (const reduce of [true, false]) {
    it(`효과가 다시 실행돼도 이동과 종료가 한 번씩이다 (동작 줄이기 ${reduce ? '켜짐' : '꺼짐'})`, async () => {
      stubMotion(reduce);
      const { onSurface, onMove, onDone } = mount();
      await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
      expect(onMove).toHaveBeenCalledTimes(1);
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onSurface).toHaveBeenCalledTimes(reduce ? 0 : 1);
    });
  }

  it('이동 응답 전에 사라지면 종료를 부르지 않는다', async () => {
    stubMotion(true);
    const onMove = vi.fn(() => new Promise<void>(res => setTimeout(res, 500)));
    const onDone = vi.fn();
    const { unmount } = render(<FerryVeil onSurface={vi.fn()} onMove={onMove} onDone={onDone} />);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('FerryVeil 화면 전체 덮개', () => {
  it('창 층 자리가 있으면 거기에 화면 전체(fixed)로 그려 탭 줄과 사이드바까지 덮는다', () => {
    stubMotion(false);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const release = windowHostRef(host);
    const { container } = render(<div data-testid="stage"><FerryVeil onSurface={vi.fn()} onMove={() => Promise.resolve()} onDone={vi.fn()} /></div>);
    const veil = host.querySelector('[aria-hidden]') as HTMLElement;
    expect(veil).not.toBeNull();
    expect(container).not.toContainElement(veil);
    expect(veil.className).toContain('fixed inset-0');
    expect(veil.className).toContain('z-(--z-veil)');
    expect(veil.className).toContain('pointer-events-none');
    act(() => release?.());
    host.remove();
  });
});
