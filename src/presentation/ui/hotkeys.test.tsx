import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HOTKEY_TIER, resetKeyScopes, useKeyBlocker, useKeyScope } from './hotkeys';

afterEach(() => {
  cleanup();
  resetKeyScopes();
});

function Scope({ tier, exclusive, onKey }: { tier?: number; exclusive?: boolean; onKey: (e: KeyboardEvent) => boolean | void }) {
  useKeyScope(onKey, { tier, exclusive });
  return null;
}

function Blocker({ tier, onEscape }: { tier?: number; onEscape?: () => void }) {
  useKeyBlocker(onEscape, tier !== undefined ? { tier } : undefined);
  return null;
}

describe('hotkeys 계층 스택', () => {
  it('HOTKEY_TIER는 BASE < STAGE_MODAL < STAGE_CONFIRM < SIDEBAR_SHEET < APP_MODAL < APP_CONFIRM < POPOVER < BLOCKER 순서다', () => {
    expect(HOTKEY_TIER).toEqual({
      BASE: 10,
      STAGE_MODAL: 20,
      STAGE_CONFIRM: 25,
      SIDEBAR_SHEET: 30,
      APP_MODAL: 40,
      APP_CONFIRM: 45,
      POPOVER: 50,
      BLOCKER: 60,
    });
  });

  it('높은 tier가 먼저 호출되고 소비(true)하면 아래 tier로 내려가지 않는다', () => {
    const calls: string[] = [];
    render(
      <>
        <Scope tier={HOTKEY_TIER.BASE} onKey={() => { calls.push('base'); return true; }} />
        <Scope tier={HOTKEY_TIER.STAGE_MODAL} onKey={() => { calls.push('stage'); return true; }} />
        <Scope tier={HOTKEY_TIER.POPOVER} onKey={() => { calls.push('popover'); return true; }} />
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(calls).toEqual(['popover']);
  });

  it('마운트 순서가 역전되어도(낮은 tier가 나중에 마운트) 항상 높은 tier가 우선한다', () => {
    const calls: string[] = [];
    const { rerender } = render(
      <>
        <Scope tier={HOTKEY_TIER.POPOVER} onKey={() => { calls.push('popover'); return true; }} />
      </>,
    );
    rerender(
      <>
        <Scope tier={HOTKEY_TIER.POPOVER} onKey={() => { calls.push('popover'); return true; }} />
        <Scope tier={HOTKEY_TIER.SIDEBAR_SHEET} onKey={() => { calls.push('sheet'); return true; }} />
        <Scope tier={HOTKEY_TIER.STAGE_CONFIRM} onKey={() => { calls.push('stageConfirm'); return true; }} />
        <Scope tier={HOTKEY_TIER.BASE} onKey={() => { calls.push('base'); return true; }} />
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(calls).toEqual(['popover']);
  });

  it('같은 tier 안에서는 나중에 마운트된 스코프(LIFO)가 먼저 호출된다', () => {
    const calls: string[] = [];
    const { rerender } = render(<Scope tier={HOTKEY_TIER.POPOVER} onKey={() => { calls.push('first'); }} />);
    rerender(
      <>
        <Scope tier={HOTKEY_TIER.POPOVER} onKey={() => { calls.push('first'); }} />
        <Scope tier={HOTKEY_TIER.POPOVER} onKey={() => { calls.push('second'); return true; }} />
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(calls).toEqual(['second']);
  });

  it('exclusive 스코프는 자기보다 낮은 tier와 같은 tier의 이전 스코프를 차단한다', () => {
    const baseFn = vi.fn();
    const olderSameTierFn = vi.fn();
    const onEscape = vi.fn();
    render(
      <>
        <Scope tier={HOTKEY_TIER.BASE} onKey={baseFn} />
        <Scope tier={HOTKEY_TIER.APP_MODAL} onKey={olderSameTierFn} />
        <Blocker tier={HOTKEY_TIER.APP_MODAL} onEscape={onEscape} />
      </>,
    );
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(baseFn).not.toHaveBeenCalled();
    expect(olderSameTierFn).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(baseFn).not.toHaveBeenCalled();
    expect(olderSameTierFn).not.toHaveBeenCalled();
  });

  it('Escape 키 repeat(길게 누르기)은 무시되어 연쇄 닫힘이 일어나지 않는다', () => {
    const onEscape = vi.fn();
    render(<Blocker tier={HOTKEY_TIER.APP_MODAL} onEscape={onEscape} />);
    const ev = new KeyboardEvent('keydown', { key: 'Escape', repeat: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('입력 요소(input/textarea/select)에 포커스가 있을 때는 어떤 스코프도 실행되지 않는다', () => {
    const onEscape = vi.fn();
    render(
      <>
        <input aria-label="입력" />
        <Blocker tier={HOTKEY_TIER.BLOCKER} onEscape={onEscape} />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('입력'), { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
  });
});
