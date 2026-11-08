import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../../../game/rules/logic';
import { resetMinimapVisible, setMinimapVisible } from '../../../features/display/service/minimapVisible';

vi.mock('../useMobileLayout', () => ({ useMobileLayout: () => false }));
vi.mock('../../ui/hud/MessageLog', () => ({ default: () => null }));
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
  : el.querySelector('[aria-label="활성 미끼"]') ? '미끼 칩'
  : el.textContent === '12:00' ? '시계'
  : el.querySelector('[aria-label="미니맵 보이기"]') ? '지도 버튼' : '?');

afterEach(() => { cleanup(); resetMinimapVisible(); });

describe('HudLayout 미니맵 위 칩 줄', () => {
  it('접속 칩, 미끼 칩, 시계, 지도 버튼이 같은 줄의 형제로 이 순서다', () => {
    setMinimapVisible(false);
    render(<HudLayout {...props} game={{ ...newState(), activeBait: 'bait-common', items: { 'bait-common': 3 } }} scene={region} chips={chip} />);
    expect(kinds()).toEqual(['접속 칩', '미끼 칩', '시계', '지도 버튼']);
  });

  it('미니맵을 보이면 지도 버튼만 빠지고 나머지 순서는 같다', () => {
    setMinimapVisible(true);
    render(<HudLayout {...props} game={{ ...newState(), activeBait: 'bait-common', items: { 'bait-common': 3 } }} scene={region} chips={chip} />);
    expect(kinds()).toEqual(['접속 칩', '미끼 칩', '시계']);
    expect(screen.getByTestId('minimap')).toBeInTheDocument();
  });

  it('접속 칩, 미끼, 미니맵이 없어도(거점) 시계는 조건 없이 그려진다', () => {
    render(<HudLayout {...props} game={newState()} scene={base} />);
    expect(kinds()).toEqual(['시계']);
  });

  it('미니맵을 숨긴 바다에서 접속 칩과 미끼가 없으면 시계, 지도 버튼 순서다', () => {
    setMinimapVisible(false);
    render(<HudLayout {...props} game={newState()} scene={region} />);
    expect(kinds()).toEqual(['시계', '지도 버튼']);
    act(() => setMinimapVisible(true));
    expect(kinds()).toEqual(['시계']);
  });
});
