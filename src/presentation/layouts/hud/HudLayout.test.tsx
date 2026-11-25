/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COOKING_UNLOCK_BOAT } from '../../../game/content/cooking';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { resetMinimapVisible, setMinimapVisible } from '../../../features/display/service/minimapVisible';

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('../useMobileLayout', () => ({ useMobileLayout: () => layout.mobile }));
vi.mock('../../ui/hud/MessageLog', () => ({ default: () => <div data-testid="log" /> }));
vi.mock('../../ui/hud/Minimap', () => ({ default: () => <div data-testid="minimap" /> }));
vi.mock('./HudHeader', () => ({ default: () => null }));
const NOW = '2026-11-12T00:00:00.000Z';
vi.mock('../../../features/gameplay/service/useGameTime', () => ({
  useGameTime: () => ({ clock: '12:00', phase: 'day', dark: 0 }), useNow: () => NOW,
}));

import HudLayout from './HudLayout';

const props = {
  log: [], covered: false, onOpenStats: () => {}, onOpenMap: () => {},
  filter: { present: [], hidden: [] } as never, onToggleFilter: () => {},
};
const region = { kind: 'region', id: 'village' } as const;
const base = { kind: 'base', id: 'home' } as const;
const chip = <span data-testid="presence">접속</span>;

// 칩 줄은 시계의 부모다. 칩 줄의 자식을 DOM 순서대로 읽는다
const rowOf = () => screen.getByText('12:00').closest('div')!.parentElement!;
const kinds = () => [...rowOf().children].map(el =>
  el.matches('[data-testid="presence"]') ? '접속 칩'
  : el.textContent === '12:00' ? '시계'
  : (el.matches('[aria-label^="활성 효과"]') || el.querySelector('[aria-label^="활성 효과"]')) ? '보너스 통합 칩'
  : el.querySelector('[aria-label="미니맵 보이기"]') ? '지도 버튼' : '?');

afterEach(() => { cleanup(); resetMinimapVisible(); layout.mobile = false; });

// 해금 전(newState)의 보너스 통합 칩은 잠금 칩 하나다
const unlocked = (slots: GameState['slots'] = { lunch: null, bait: null }): GameState =>
  ({ ...newState(), boat: COOKING_UNLOCK_BOAT, slots });
const HOUR_LATER = '2026-11-12T01:00:00.000Z';

describe('HudLayout 미니맵 위 칩 줄', () => {
  it('접속 칩, 보너스 통합 칩, 시계, 지도 버튼이 같은 줄의 형제로 이 순서다', () => {
    setMinimapVisible(false);
    render(<HudLayout {...props} game={newState()} scene={region} chips={chip} />);
    expect(kinds()).toEqual(['접속 칩', '보너스 통합 칩', '시계', '지도 버튼']);
  });

  it('해금 뒤에는 활성 효과가 없으면 흐린 효과 0을 두고, 효과가 켜지면 활성 수(효과 N)를 보인다', () => {
    setMinimapVisible(true);
    const { unmount } = render(<HudLayout {...props} game={unlocked()} scene={region} chips={chip} />);
    expect(kinds()).toEqual(['접속 칩', '보너스 통합 칩', '시계']);
    expect(screen.getByRole('group', { name: '활성 효과 없음' })).toHaveTextContent('효과0');
    unmount();
    render(<HudLayout {...props} scene={region} chips={chip}
                      game={unlocked({ lunch: null, bait: { id: 'cook-bait-mutation', endsAt: HOUR_LATER } })} />);
    expect(kinds()).toEqual(['접속 칩', '보너스 통합 칩', '시계']);
    expect(screen.getByRole('group', { name: '활성 효과 1개' })).toHaveTextContent('효과1');
  });

  it('칩 줄은 포인터 이벤트를 받지 않고 칩 자신만 받는다', () => {
    setMinimapVisible(false);
    render(<HudLayout {...props} game={unlocked({ lunch: { id: 'cook-lunch-bite', endsAt: HOUR_LATER }, bait: null })}
                      scene={region} chips={chip} />);
    expect(rowOf().className).toContain('pointer-events-none');
    const slot = screen.getByRole('group', { name: '활성 효과 1개' });
    expect(slot.className).toContain('pointer-events-auto');
    expect(screen.getByText('12:00').closest('div')!.className).toContain('pointer-events-auto');
  });

  it('미니맵을 보이면 지도 버튼만 빠지고 나머지 순서는 같다', () => {
    setMinimapVisible(true);
    render(<HudLayout {...props} game={unlocked()} scene={region} chips={chip} />);
    expect(kinds()).toEqual(['접속 칩', '보너스 통합 칩', '시계']);
    expect(screen.getByTestId('minimap')).toBeInTheDocument();
  });

  it('접속 칩과 미니맵이 없어도(거점) 보너스 통합 칩과 시계는 그려진다', () => {
    render(<HudLayout {...props} game={newState()} scene={base} />);
    expect(kinds()).toEqual(['보너스 통합 칩', '시계']);
  });

  it('미니맵을 숨긴 바다에서 접속 칩이 없으면 보너스 통합 칩, 시계, 지도 버튼 순서다', () => {
    setMinimapVisible(false);
    render(<HudLayout {...props} game={newState()} scene={region} />);
    expect(kinds()).toEqual(['보너스 통합 칩', '시계', '지도 버튼']);
    act(() => setMinimapVisible(true));
    expect(kinds()).toEqual(['보너스 통합 칩', '시계']);
  });
});

describe('HudLayout 하단 HUD 묶음 및 상태 띠 고정 슬롯 분리', () => {
  it.each([false, true])('PC와 모바일(mobile=%s) 모두 statusSlot은 하단 묶음과 분리된 스테이지 하단 중앙 absolute 고정 슬롯이고, 오른쪽 아래 열과 메시지 창만 하단 묶음에 둔다', mobile => {
    layout.mobile = mobile;
    setMinimapVisible(true);
    let slot: HTMLDivElement | null = null;
    render(<HudLayout {...props} game={newState()} scene={region} onStatusSlot={el => { slot = el; }} />);
    const log = screen.getByTestId('log');
    const bundle = log.parentElement!;
    expect(slot).not.toBeNull();
    expect(bundle.contains(slot)).toBe(false);
    expect(slot!.className).toContain('absolute');
    expect(slot!.className).toContain('z-(--z-stage-status)');
    expect(slot!.className).toContain('bottom-24');
    expect(slot!.className).toContain('mobile:bottom-24');
    expect(slot!.className).toContain('mobile:row-start-2');
    expect(slot!.className).toContain('mobile:row-end-3');
    expect(slot!.className).toContain('pointer-events-none');
    expect(bundle.contains(screen.getByTestId('minimap'))).toBe(true);
    expect(bundle.contains(screen.getByText('12:00'))).toBe(true);
    expect(bundle.lastElementChild).toBe(log);
    expect(bundle.className).not.toContain('z-(--z-');
  });

  it.each([false, true])('PC와 모바일(mobile=%s) 모두 방치 결과 카드·흔적 카드 출현, 미니맵 숨김, 메시지 창 접기에도 statusSlot 위치 클래스와 DOM 슬롯이 불변이다', mobile => {
    layout.mobile = mobile;
    setMinimapVisible(true);
    let slot: HTMLDivElement | null = null;
    const { rerender } = render(
      <HudLayout {...props} game={newState()} scene={region} folded={false}
                 notice={null} onStatusSlot={el => { slot = el; }} />,
    );
    const initialClass = slot!.className;
    const initialParent = slot!.parentElement;

    setMinimapVisible(false);
    rerender(
      <HudLayout {...props} game={newState()} scene={region} folded
                 notice={<><div data-testid="away">방치</div><div data-testid="trace">흔적</div></>}
                 onStatusSlot={el => { slot = el; }} />,
    );
    expect(slot!.className).toBe(initialClass);
    expect(slot!.parentElement).toBe(initialParent);
    expect(screen.getByTestId('away')).toBeInTheDocument();
    expect(screen.getByTestId('trace')).toBeInTheDocument();
  });

  it('채팅이 칩 줄, 미니맵과 같은 묶음의 마지막 자식이다 - 채팅 높이가 늘면 칩 줄과 미니맵이 그 위에 쌓인 채 따라 올라간다', () => {
    layout.mobile = true;
    setMinimapVisible(true);
    render(<HudLayout {...props} game={newState()} scene={region} />);
    const log = screen.getByTestId('log');
    const bundle = log.parentElement!;
    expect(bundle.contains(screen.getByTestId('minimap'))).toBe(true);
    expect(bundle.contains(screen.getByText('12:00'))).toBe(true);
    expect(bundle.lastElementChild).toBe(log);
    for (const cls of ['absolute', 'mobile:flex-col', 'mobile:inset-x-2', '--keyboard-h']) expect(bundle.className).toContain(cls);
    expect(bundle.className).not.toContain('row-start-3');
    expect(bundle.className).not.toContain('z-(--z-');
  });

  it('칩 줄과 미니맵을 담은 줄기는 스테이지 위 HUD 층이고 묶음 자체는 층을 갖지 않는다', () => {
    layout.mobile = true;
    setMinimapVisible(true);
    render(<HudLayout {...props} game={newState()} scene={region} />);
    const stack = screen.getByTestId('minimap').parentElement!.parentElement!;
    expect(stack.className).toContain('z-(--z-stage-hud)');
    expect(stack.className).toContain('relative');
  });

  it('PC와 모바일 모두 헤더가 채팅보다 먼저 그려져 탭 이동 순서가 헤더, 채팅이다', () => {
    const src = readFileSync('src/presentation/layouts/hud/HudLayout.tsx', 'utf-8');
    expect(src.indexOf('<HudHeader')).toBeGreaterThan(-1);
    expect(src.indexOf('<HudHeader')).toBeLessThan(src.indexOf('<MessageLog'));
  });

  it.each([false, true])('PC와 모바일(mobile=%s) 모두 catchSlot은 하단 묶음과 분리되고 z-index 없이 PC 좌측·모바일 중앙 채팅창 위에 배치된다', mobile => {
    layout.mobile = mobile;
    setMinimapVisible(true);
    let catchSlot: HTMLDivElement | null = null;
    render(<HudLayout {...props} game={newState()} scene={region} onCatchSlot={el => { catchSlot = el; }} />);
    const log = screen.getByTestId('log');
    const bundle = log.parentElement!;
    expect(catchSlot).not.toBeNull();
    expect(bundle.contains(catchSlot)).toBe(false);
    expect(catchSlot!.className).toContain('absolute');
    expect(catchSlot!.className).toContain('pointer-events-none');
    expect(catchSlot!.className).toContain('empty:hidden');
    expect(catchSlot!.className).toContain('justify-start');
    expect(catchSlot!.className).toContain('bottom-62');
    expect(catchSlot!.className).toContain('mobile:justify-center');
    expect(catchSlot!.className).toContain('mobile:bottom-48');
    expect(catchSlot!.className).not.toMatch(/\bz-/);
  });
});
