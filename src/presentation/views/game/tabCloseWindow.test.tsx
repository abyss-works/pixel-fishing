// 탭 줄은 창 위 층이다 - 창이 떠 있어도 탭을 누르면 떠 있던 창이 닫히고 그 탭이 열린다(App 통합).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import App from '../../../App';
import { resetKeyScopes } from '../../ui/hotkeys';
import Modal from '../../ui/Modal';
import { resetOpenWindows } from '../../ui/openWindows';
import { resetCanvasCover } from '../../layouts/game-stage/canvasCover';
import { resetSpotState } from '../../../game/world/currentSpot';
import { resetWhatsNewSession } from '../../../features/announcements/service/whatsNew';
import { resetTutorialSession } from '../../../features/tutorial/service/tutorial';
import { markPromptsAnswered, resetAnnouncements, setLastSeenVersion } from '../../../platform/adapters/announcements';
import { APP_VERSION } from '../../../version';
import { TUTORIAL_IDS } from '../../../game/content/tutorials';
import { MAX_BOAT, newState } from '../../../game/rules/logic';
import type { BaseId } from '../../../game/world';

const SAVE_KEY = 'pixel-fishing-save';

// 모든 메서드와 속성을 받아 주는 그리기 맥락 대역 — 엔진의 프레임 루프를 돌리는 데만 쓴다
function fakeContext(): CanvasRenderingContext2D {
  const target = function () {};
  const ctx: unknown = new Proxy(target, {
    get: (_t, key) => key === Symbol.toPrimitive ? () => 0 : ctx,
    set: () => true,
    apply: () => ctx,
  });
  return ctx as CanvasRenderingContext2D;
}

function stubMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function seedAt(base: BaseId) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    ...newState(), tutorials: [...TUTORIAL_IDS], boat: MAX_BOAT, location: { kind: 'base', id: base },
  }));
}

const originalMatchMedia = window.matchMedia;
const originalContext = HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  localStorage.clear();
  resetCanvasCover();
  resetWhatsNewSession();
  resetTutorialSession();
  resetAnnouncements();
  setLastSeenVersion(APP_VERSION);
  markPromptsAnswered(['fish-art']);
  resetKeyScopes();
  resetOpenWindows();
  resetSpotState();
  HTMLCanvasElement.prototype.getContext = (() => fakeContext()) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.matchMedia = originalMatchMedia;
  HTMLCanvasElement.prototype.getContext = originalContext;
});

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('탭 줄은 창 위 층이다', () => {
  it('시설 창이 떠 있어도 탭을 누르면 창이 닫히고 그 탭이 열린다', async () => {
    stubMotion(false);
    seedAt('home');
    render(<App />);
    await advance(0);
    fireEvent.click(document.querySelector('[data-facility="rod"]')!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '도움말' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: '도움말' })).toHaveClass('active');
  });

  it('확인 창이 떠 있어도 탭을 누르면 확인 창이 취소로 닫힌다', async () => {
    stubMotion(false);
    seedAt('harbor');
    render(<App />);
    await advance(0);
    fireEvent.click(document.querySelector('[data-facility="travel"]')!);
    await advance(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('설정 탭에서 연 앱 모달도 다른 탭을 누르면 닫힌다', async () => {
    stubMotion(false);
    seedAt('home');
    render(<App />);
    await advance(0);
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    fireEvent.click(screen.getByRole('button', { name: /패치노트/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '도움말' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('게임 화면 바깥에서 띄운 앱 모달도 게임 화면의 쌓임 맥락 안에 그려져 탭 줄을 덮지 않는다', async () => {
    stubMotion(false);
    seedAt('home');
    render(<><App /><Modal title="바깥 대화상자" onClose={() => {}}>본문</Modal></>);
    await advance(0);
    const root = document.querySelector('[data-game-stage]')!.parentElement as HTMLElement;
    const dialog = screen.getByRole('dialog', { name: '바깥 대화상자' });
    expect(root).toContainElement(dialog);
    // 탭 줄은 같은 쌓임 맥락 안에서 창보다 위 토큰이다
    expect(dialog.parentElement!.className).toContain('z-(--z-app-modal)');
    fireEvent.click(screen.getByRole('button', { name: '도움말' }));
    expect(screen.getByRole('button', { name: '도움말' })).toHaveClass('active');
  });

  it('닫을 수 없는 창이 떠 있으면 그 창은 그대로 두고 탭을 연다', async () => {
    stubMotion(false);
    seedAt('home');
    render(<><App /><Modal layer="stage" closable={false} title="진행 중" onClose={() => {}}>결과 전송 전</Modal></>);
    await advance(0);
    fireEvent.click(document.querySelector('[data-facility="rod"]')!);
    expect(screen.getAllByRole('dialog').length).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: '도움말' }));
    // 닫을 수 있는 시설 창은 닫히고, 닫을 수 없는 창은 남으며, 탭은 열린다
    expect(screen.getAllByRole('dialog').length).toBe(1);
    expect(screen.getByRole('dialog', { name: '진행 중' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '도움말' })).toHaveClass('active');
  });
});
