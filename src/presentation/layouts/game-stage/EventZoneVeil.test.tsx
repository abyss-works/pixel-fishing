// 이벤트 구역 전환 덮개는 효과가 다시 실행돼도 이동 한 번에 onMove와 onDone을 각각 한 번만 부른다.
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetKeyScopes, useKeyScope } from '../../ui/hotkeys';
import { windowHostRef } from '../../ui/windowLayer';
import EventZoneVeil from './EventZoneVeil';

function stubMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;
beforeEach(() => {
  resetKeyScopes();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  resetKeyScopes();
  vi.useRealTimers();
  window.matchMedia = originalMatchMedia;
});

function mount(mode: 'enter' | 'leave' = 'enter') {
  const onMove = vi.fn(() => Promise.resolve());
  const onDone = vi.fn();
  const view = render(<StrictMode><EventZoneVeil mode={mode} onMove={onMove} onDone={onDone} /></StrictMode>);
  return { onMove, onDone, view };
}

function KeyProbe({ onKey }: { onKey: (key: string) => void }) {
  useKeyScope(e => { onKey(e.key); });
  return null;
}

describe('EventZoneVeil 이동 1회 보장', () => {
  for (const reduce of [true, false]) {
    it(`효과가 다시 실행돼도 이동과 종료가 한 번씩이다 (동작 줄이기 ${reduce ? '켜짐' : '꺼짐'})`, async () => {
      stubMotion(reduce);
      const { onMove, onDone } = mount('enter');
      await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
      expect(onMove).toHaveBeenCalledTimes(1);
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  }

  it('이동 응답 전에 사라지면 종료를 부르지 않는다', async () => {
    stubMotion(true);
    const onMove = vi.fn(() => new Promise<void>(res => setTimeout(res, 500)));
    const onDone = vi.fn();
    const { unmount } = render(<EventZoneVeil mode="enter" onMove={onMove} onDone={onDone} />);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('EventZoneVeil 겨울 덮개와 자막·키 차단', () => {
  it('창 층 자리가 있으면 깊은 겨울 남청(#071122) fixed 덮개·픽셀 눈발·입장 자막을 그린다', async () => {
    stubMotion(false);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const release = windowHostRef(host);
    const { container } = render(
      <div data-testid="stage">
        <EventZoneVeil mode="enter" onMove={() => Promise.resolve()} onDone={vi.fn()} />
      </div>,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(280); });
    const veil = host.querySelector('[data-event-zone-veil]') as HTMLElement;
    expect(veil).not.toBeNull();
    expect(container).not.toContainElement(veil);
    expect(veil.className).toContain('fixed inset-0');
    expect(veil.className).toContain('z-(--z-veil)');
    expect(veil.className).toContain('pointer-events-none');
    expect(veil.style.backgroundColor).toBe('rgb(7, 17, 34)');
    expect(veil.querySelectorAll('[data-snowflake]').length).toBeGreaterThan(0);
    expect(screen.getByText('강태공 분지 호수로 이동하고 있어요.')).toBeInTheDocument();
    act(() => release?.());
    host.remove();
  });

  it('퇴장 모드에서는 돌아가기 자막을 표시하고, 동작 줄이기 설정 시 덮개 없이 즉시 전환한다', async () => {
    stubMotion(false);
    render(<EventZoneVeil mode="leave" onMove={() => Promise.resolve()} onDone={vi.fn()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.getByText('원래 있던 곳으로 돌아가고 있어요.')).toBeInTheDocument();

    cleanup();
    stubMotion(true);
    const onMove = vi.fn(() => Promise.resolve());
    const onDone = vi.fn();
    render(<EventZoneVeil mode="leave" onMove={onMove} onDone={onDone} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-event-zone-veil]')).toBeNull();
  });

  it('전환 중 Esc 키만 차단하고 다른 키 입력은 통과시킨다', async () => {
    stubMotion(false);
    const onKey = vi.fn();
    render(
      <>
        <KeyProbe onKey={onKey} />
        <EventZoneVeil mode="enter" onMove={() => Promise.resolve()} onDone={vi.fn()} />
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onKey).not.toHaveBeenCalledWith('Escape');
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onKey).toHaveBeenCalledWith('Enter');
  });
});
