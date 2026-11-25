// 스테이지 모달은 사이드바 탭 전환·모바일 시트와 상호 비간섭이고, 앱 모달만 사이드바를 막는다(App 통합).
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
import { resetFortuneModalSession } from '../../../features/fortune/service/fortuneModal';
import { markPromptsAnswered, resetAnnouncements, setLastSeenVersion } from '../../../platform/adapters/announcements';
import { APP_VERSION } from '../../../version';
import { TUTORIAL_IDS } from '../../../game/content/tutorials';
import { MAX_BOAT, newState } from '../../../game/rules/logic';
import { gameDayOf } from '../../../game/rules/time';
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

function stubMotion(reduce: boolean, mobile = false) {
  window.matchMedia = ((query: string) => ({
    matches: (reduce && query.includes('prefers-reduced-motion'))
      || (mobile && query.includes('width <')),
    media: query, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function seedAt(base: BaseId) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    ...newState(),
    tutorials: [...TUTORIAL_IDS],
    fortune: { day: gameDayOf(new Date().toISOString()), kind: 'shadow', index: 3 },
    boat: MAX_BOAT,
    location: { kind: 'base', id: base },
  }));
}

const originalMatchMedia = window.matchMedia;
const originalContext = HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  localStorage.clear();
  resetCanvasCover();
  resetWhatsNewSession();
  resetTutorialSession();
  resetFortuneModalSession();
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

describe('모달과 사이드 메뉴 상호 비간섭 및 계층 분리', () => {
  const activeTab = () => document.querySelector('.pf-tabbar button.active')?.textContent ?? '';

  it('시설 모달(stage)이 떠 있어도 탭을 누르면 모달은 유지되고 탭은 자유롭게 전환된다', async () => {
    stubMotion(false);
    seedAt('home');
    render(<App />);
    await advance(0);
    fireEvent.click(document.querySelector('[data-facility="rod"]')!);
    const dialog = screen.getByRole('dialog');
    expect(document.querySelector('[data-game-stage]')!).toContainElement(dialog);
    expect(dialog.parentElement!.className).toContain('absolute inset-0');
    fireEvent.click(screen.getByRole('button', { name: '도움말' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(activeTab()).toContain('도움말');
    expect(screen.getByRole('button', { name: '도움말' })).toHaveClass('active');
  });

  it('확인 모달(stage)이 떠 있어도 탭을 누르면 확인 창은 남고 탭은 전환된다', async () => {
    stubMotion(false);
    seedAt('harbor');
    render(<App />);
    await advance(0);
    fireEvent.click(document.querySelector('[data-facility="travel"]')!);
    await advance(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(activeTab()).toContain('설정');
  });

  it('닫을 수 없는 스테이지 모달이 떠 있어도 탭 전환은 가능하고 창은 그대로 유지된다', async () => {
    stubMotion(false);
    seedAt('home');
    render(<><App /><Modal layer="stage" closable={false} title="진행 중" onClose={() => {}}>결과 전송 전</Modal></>);
    await advance(0);
    fireEvent.click(document.querySelector('[data-facility="rod"]')!);
    expect(screen.getAllByRole('dialog').length).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: '도움말' }));
    expect(screen.getAllByRole('dialog').length).toBe(2);
    expect(screen.getByRole('dialog', { name: '진행 중' })).toBeInTheDocument();
    expect(activeTab()).toContain('도움말');
  });

  it('모바일 레이아웃에서 스테이지 모달이 열린 중에도 아래 탭 시트를 열고 닫을 수 있고 모달 상태는 유지된다', async () => {
    stubMotion(false, true);
    seedAt('home');
    render(<App />);
    await advance(0);
    fireEvent.click(document.querySelector('[data-facility="rod"]')!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '도움말' }));
    expect(screen.getByRole('region', { name: '탭 내용' })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '도움말' }));
    expect(screen.queryByRole('region', { name: '탭 내용' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('바다 미니맵에서 여는 세계지도 창도 스테이지 안에 머무르고 사이드바를 막지 않는다', async () => {
    stubMotion(false);
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      ...newState(),
      tutorials: [...TUTORIAL_IDS],
      fortune: { day: gameDayOf(new Date().toISOString()), kind: 'shadow', index: 3 },
      boat: MAX_BOAT,
      location: { kind: 'region', id: 'village' },
    }));
    render(<App />);
    await advance(0);
    fireEvent.click(screen.getByLabelText('미니맵'));
    const mapDialog = screen.getByRole('dialog');
    const stage = document.querySelector('[data-game-stage]')!;
    expect(stage).toContainElement(mapDialog);
    expect(mapDialog.parentElement!.className).toContain('absolute inset-0');
    expect(mapDialog.parentElement!.className).not.toContain('fixed inset-0');
    fireEvent.click(screen.getByRole('button', { name: /^가방/ }));
    expect(activeTab()).toContain('가방');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('설정 탭에서 연 앱 모달은 다른 탭을 눌러 닫히지 않고 탭 전환을 막는다', async () => {
    stubMotion(false);
    seedAt('home');
    render(<App />);
    await advance(0);
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    fireEvent.click(screen.getByRole('button', { name: /패치노트/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '도움말' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(activeTab()).toContain('설정');
  });

  it('게임 화면 바깥에서 띄운 앱 모달도 게임 화면의 쌓임 맥락 안에 그려져 탭 줄 위 층에 놓인다', async () => {
    stubMotion(false);
    seedAt('home');
    render(<><App /><Modal layer="app" title="바깥 대화상자" onClose={() => {}}>본문</Modal></>);
    await advance(0);
    const root = document.querySelector('[data-game-stage]')!.parentElement as HTMLElement;
    const dialog = screen.getByRole('dialog', { name: '바깥 대화상자' });
    expect(root).toContainElement(dialog);
    expect(dialog.parentElement!.className).toContain('z-(--z-app-modal)');
    fireEvent.click(screen.getByRole('button', { name: '도움말' }));
    expect(screen.getByRole('dialog', { name: '바깥 대화상자' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '도움말' })).not.toHaveClass('active');
  });

  it('모바일 가방 시트에서 기운 얻기·자동 잠금 창은 시트를 닫지 않고 z-(--z-tabs) 바깥의 앱 모달 층(z-(--z-app-modal))에 뜬다', async () => {
    stubMotion(false, true);
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      ...newState(),
      tutorials: [...TUTORIAL_IDS],
      fortune: { day: gameDayOf(new Date().toISOString()), kind: 'shadow', index: 3 },
      boat: MAX_BOAT,
      location: { kind: 'region', id: 'world' },
      bag: [{ uid: 'f1', fishId: 'crucian', form: 'normal', size: 20, caughtAt: null, spot: null, judgment: null, locked: false }],
    }));
    render(<App />);
    await advance(0);

    fireEvent.click(screen.getByRole('button', { name: /^가방/ }));
    expect(screen.getByRole('region', { name: '탭 내용' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '기운 얻기' }));
    const energyDialog = screen.getByRole('dialog', { name: '기운 얻기' });
    const stage = document.querySelector('[data-game-stage]')!;
    expect(stage).not.toContainElement(energyDialog);
    expect(energyDialog.parentElement!.className).toContain('fixed inset-0');
    expect(energyDialog.parentElement!.className).toContain('z-(--z-app-modal)');
    expect(energyDialog.parentElement!.closest('[class*="z-(--z-tabs)"]')).toBeNull();
    expect(screen.getByRole('region', { name: '탭 내용' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog', { name: '기운 얻기' })).toBeNull();
    expect(screen.getByRole('region', { name: '탭 내용' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '자동 잠금' }));
    const lockDialog = screen.getByRole('dialog', { name: '자동 잠금' });
    expect(stage).not.toContainElement(lockDialog);
    expect(lockDialog.parentElement!.className).toContain('z-(--z-app-modal)');
    expect(lockDialog.parentElement!.closest('[class*="z-(--z-tabs)"]')).toBeNull();
  });
});
