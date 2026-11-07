// 여객선 빠른 이동 — 도착 위치 반영, 전환 중 조작 잠금, 이동 거절 되돌림을 App 통합으로 검증한다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import App from '../../../App';
import Field from '../../layouts/game-stage/Field';
import { resetKeyScopes } from '../../ui/hotkeys';
import { resetCanvasCover } from '../../layouts/game-stage/canvasCover';
import { resetSpotState, getSpotState } from '../../../game/world/currentSpot';
import { resetWhatsNewSession } from '../../../features/announcements/service/whatsNew';
import { resetTutorialSession } from '../../../features/tutorial/service/tutorial';
import { markPromptsAnswered, resetAnnouncements, setDismissedVersion } from '../../../platform/adapters/announcements';
import { APP_VERSION } from '../../../version';
import { TUTORIAL_IDS } from '../../../game/content/tutorials';
import { MAX_BOAT, newState } from '../../../game/rules/logic';
import { LocalGameGateway } from '../../../platform/adapters/localGameGateway';
import { AppError } from '../../../core/errors';
import { BASE_PACKS, boardingOf } from '../../../game/world';
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
  setDismissedVersion(APP_VERSION);
  markPromptsAnswered(['fish-art']);
  resetKeyScopes();
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
const press = (code: string) => fireEvent.keyDown(document, { code });
const pos = () => getSpotState().pos;

/** 항구의 여객선 창에서 도착 항구를 고르고 확인한다 */
async function bookFerry(to: BaseId) {
  fireEvent.click(document.querySelector('[data-facility="ferry"]')!);
  fireEvent.click(screen.getByRole('button', { name: BASE_PACKS[to].name }));
  fireEvent.click(screen.getByRole('button', { name: `${BASE_PACKS[to].name}에 가기` }));
  await advance(0);
}

describe('여객선 빠른 이동: 도착 위치', () => {
  it('동작 줄이기가 꺼져 있어도 도착 항구 앞바다 좌표로 옮겨진다', async () => {
    stubMotion(false);
    seedAt('toamasina');
    render(<App />);
    await advance(0);
    await bookFerry('manila');
    await advance(3000);
    expect(pos()).toEqual(boardingOf('manila').at);
  });

  it('동작 줄이기가 켜져 있으면 도착 항구 앞바다 좌표에서 시작한다', async () => {
    stubMotion(true);
    seedAt('toamasina');
    render(<App />);
    await advance(0);
    await bookFerry('manila');
    await advance(3000);
    expect(pos()).toEqual(boardingOf('manila').at);
  });

  it('같은 좌표를 다시 지정해도 순번이 바뀌면 그 자리로 되돌아온다', async () => {
    const spot = boardingOf('manila').at!;
    const props = {
      region: 'world' as const, game: newState(), dispatch: vi.fn(), setToast: vi.fn(), onScene: vi.fn(), initialPos: spot,
    };
    const { rerender } = render(<Field {...props} placeSeq={1} />);
    await advance(100);
    expect(pos()).toEqual(spot);
    press('ArrowLeft');
    await advance(300);
    expect(pos()).not.toEqual(spot);
    rerender(<Field {...props} placeSeq={2} />);
    await advance(0);
    expect(pos()).toEqual(spot);
  });
});

describe('여객선 빠른 이동: 전환 중 조작 잠금', () => {
  it('전환 중 방향키를 눌러도 엔진 위치가 변하지 않는다', async () => {
    stubMotion(false);
    seedAt('toamasina');
    render(<App />);
    await advance(0);
    await bookFerry('manila');
    await advance(200);
    const before = pos();
    expect(before).toEqual(boardingOf('toamasina').at);
    press('ArrowRight');
    press('KeyW');
    await advance(400);
    expect(pos()).toEqual(before);
  });
});

describe('여객선 빠른 이동: 거절과 실패', () => {
  it('이동 처리가 실패하면 떠난 항구에 남고 사유가 메시지 창에 보인다', async () => {
    stubMotion(false);
    seedAt('toamasina');
    render(<App />);
    await advance(0);
    vi.spyOn(LocalGameGateway.prototype, 'dispatch').mockImplementation(() => {
      throw new AppError('rate-limited', 'action pacing rejected');
    });
    await bookFerry('manila');
    await advance(3000);
    expect(screen.getByLabelText('항구')).toBeInTheDocument();
    expect(screen.queryByText(/너무 빠르게/)).not.toBeNull();
  });

  it('승선 이동 처리가 거부 오류를 받으면 장소를 되돌리고 미처리 거부가 생기지 않는다', async () => {
    stubMotion(false);
    seedAt('toamasina');
    render(<App />);
    await advance(0);
    const unhandled = vi.fn();
    const onRejection = (e: PromiseRejectionEvent) => unhandled(e.reason);
    window.addEventListener('unhandledrejection', onRejection);
    vi.spyOn(LocalGameGateway.prototype, 'dispatch').mockImplementation(
      () => Promise.reject(new AppError('rate-limited', 'action pacing rejected')) as never);
    fireEvent.click(document.querySelector('[data-facility="exit"]')!);
    await advance(100);
    window.removeEventListener('unhandledrejection', onRejection);
    expect(unhandled).not.toHaveBeenCalled();
    expect(screen.getByLabelText('항구')).toBeInTheDocument();
  });
});

describe('여객선 확인창', () => {
  it('도착 항구 이름이 본문과 확인 버튼에 보인다', async () => {
    stubMotion(false);
    seedAt('toamasina');
    render(<App />);
    await advance(0);
    fireEvent.click(document.querySelector('[data-facility="ferry"]')!);
    fireEvent.click(screen.getByRole('button', { name: BASE_PACKS.manila.name }));
    await advance(0);
    expect(screen.getByText(new RegExp(`${BASE_PACKS.manila.name}에 갈까요`))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${BASE_PACKS.manila.name}에 가기` })).toBeInTheDocument();
  });
});
