/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../../../game/rules/logic';
import { resetMinimapVisible, setMinimapVisible } from '../../../features/display/service/minimapVisible';

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('../useMobileLayout', () => ({ useMobileLayout: () => layout.mobile }));
vi.mock('../../ui/hud/MessageLog', () => ({ default: () => <div data-testid="log" /> }));
vi.mock('../../ui/hud/Minimap', () => ({ default: () => <div data-testid="minimap" /> }));
vi.mock('./HudHeader', () => ({ default: () => null }));
vi.mock('../../../features/gameplay/service/useGameTime', () => ({ useGameTime: () => ({ clock: '12:00', dark: 0 }) }));

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
  : el.querySelector('[aria-label="미니맵 보이기"]') ? '지도 버튼' : '?');

afterEach(() => { cleanup(); resetMinimapVisible(); layout.mobile = false; });

describe('HudLayout 미니맵 위 칩 줄', () => {
  it('접속 칩, 시계, 지도 버튼이 같은 줄의 형제로 이 순서다', () => {
    setMinimapVisible(false);
    render(<HudLayout {...props} game={newState()} scene={region} chips={chip} />);
    expect(kinds()).toEqual(['접속 칩', '시계', '지도 버튼']);
  });

  it('미니맵을 보이면 지도 버튼만 빠지고 나머지 순서는 같다', () => {
    setMinimapVisible(true);
    render(<HudLayout {...props} game={newState()} scene={region} chips={chip} />);
    expect(kinds()).toEqual(['접속 칩', '시계']);
    expect(screen.getByTestId('minimap')).toBeInTheDocument();
  });

  it('접속 칩과 미니맵이 없어도(거점) 시계는 조건 없이 그려진다', () => {
    render(<HudLayout {...props} game={newState()} scene={base} />);
    expect(kinds()).toEqual(['시계']);
  });

  it('미니맵을 숨긴 바다에서 접속 칩이 없으면 시계, 지도 버튼 순서다', () => {
    setMinimapVisible(false);
    render(<HudLayout {...props} game={newState()} scene={region} />);
    expect(kinds()).toEqual(['시계', '지도 버튼']);
    act(() => setMinimapVisible(true));
    expect(kinds()).toEqual(['시계']);
  });
});

describe('HudLayout 모바일 채팅 묶음 구조', () => {
  it('채팅이 칩 줄, 미니맵과 같은 묶음의 마지막 자식이다 - 채팅 높이가 늘면 칩 줄과 미니맵이 그 위에 쌓인 채 따라 올라간다', () => {
    layout.mobile = true;
    setMinimapVisible(true);
    render(<HudLayout {...props} game={newState()} scene={region} />);
    const log = screen.getByTestId('log');
    const bundle = log.parentElement!;
    expect(bundle.contains(screen.getByTestId('minimap'))).toBe(true);
    expect(bundle.contains(screen.getByText('12:00'))).toBe(true);
    expect(bundle.lastElementChild).toBe(log);
    for (const cls of ['mobile:absolute', 'mobile:flex-col', 'mobile:inset-x-2', '--keyboard-h']) expect(bundle.className).toContain(cls);
    expect(bundle.className).not.toContain('row-start-3');
    expect(bundle.className).not.toContain('z-(--z-');
  });

  it('칩 줄과 미니맵을 담은 줄기는 스테이지 위 HUD 층이고 묶음 자체는 층을 갖지 않는다', () => {
    layout.mobile = true;
    setMinimapVisible(true);
    render(<HudLayout {...props} game={newState()} scene={region} />);
    const stack = screen.getByTestId('minimap').parentElement!.parentElement!;
    expect(stack.className).toContain('z-(--z-stage-hud)');
    expect(stack.className).toContain('mobile:relative');
  });

  it('PC와 모바일 모두 헤더가 채팅보다 먼저 그려져 탭 이동 순서가 헤더, 채팅이다', () => {
    const src = readFileSync('src/presentation/layouts/hud/HudLayout.tsx', 'utf-8');
    expect(src.indexOf('<HudHeader')).toBeGreaterThan(-1);
    expect(src.indexOf('<HudHeader')).toBeLessThan(src.indexOf('<MessageLog'));
  });
});
