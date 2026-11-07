import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useLogHeight } from './useLogHeight';
import { MOBILE_QUERY } from '../useMobileLayout';

const originalRO = globalThis.ResizeObserver;
const originalMM = window.matchMedia;
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!;
afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalRO;
  window.matchMedia = originalMM;
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalHeight);
});

function Probe() {
  const ref = useLogHeight();
  return <div data-game-stage><div><div ref={ref} /></div></div>;
}

function stubObserver() {
  const disconnect = vi.fn();
  globalThis.ResizeObserver = class { observe() {} disconnect = disconnect; } as unknown as typeof ResizeObserver;
  return disconnect;
}

function setMobile(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: mobile && query === MOBILE_QUERY, media: query,
    addEventListener: () => {}, removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function Orphan() {
  const ref = useLogHeight();
  return <div><div ref={ref} /></div>;
}

describe('useLogHeight', () => {
  it('PC 배치에서는 창 높이를 스테이지의 --log-h로 알리고 사라지면 지운다', () => {
    setMobile(false);
    stubObserver();
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 152 });
    const { container, unmount } = render(<Probe />);
    const stage = container.firstElementChild as HTMLElement;
    expect(stage.style.getPropertyValue('--log-h')).toBe('152px');
    unmount();
    expect(stage.style.getPropertyValue('--log-h')).toBe('');
  });

  it('모바일 배치에서는 알리지 않는다', () => {
    setMobile(true);
    stubObserver();
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 152 });
    const { container } = render(<Probe />);
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--log-h')).toBe('');
  });

  it('가까운 스테이지 표식이 없으면 아무것도 쓰지 않는다', () => {
    setMobile(false);
    stubObserver();
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 152 });
    const { container } = render(<Orphan />);
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--log-h')).toBe('');
  });
});
