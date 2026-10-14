// 미니맵 — 캔버스를 자기가 소유하고, 위치 변경은 React 재렌더 없이 바로 그린다.
// "이동 중 전 트리 리렌더" 해소의 회귀 방지선이다 — 렌더가 아니라 구독·그리기로 반응한다.
import { Profiler } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REGION_PACKS } from '../../../game/world';
import { resetSpotState, setPlayerPos } from '../../../game/world/currentSpot';
import Minimap from './Minimap';

const { draw } = vi.hoisted(() => ({ draw: vi.fn() }));

vi.mock('../../views/overlays/world-map/worldmap.js', () => ({
  MINIMAP_VIEW_W: 100, MINIMAP_VIEW_H: 100,
  minimapView: () => ({ x: 0, y: 0, w: 100, h: 100 }),
  renderWorldMap: draw,
}));
// 자체 타이머로 커밋하는 배지 — 재렌더 계수에 섞이지 않게 뺀다.
vi.mock('./TimeBadge', () => ({ default: () => null }));

describe('Minimap', () => {
  beforeEach(() => {
    resetSpotState();
    draw.mockClear();
    // jsdom에는 2d 컨텍스트가 없다 — 그리기 호출 여부만 본다.
    HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as
      typeof HTMLCanvasElement.prototype.getContext;
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('위치 변경은 캔버스를 다시 그리되 React 재렌더를 만들지 않는다', () => {
    const def = REGION_PACKS.world;
    setPlayerPos({ x: def.spawn.x, y: def.spawn.y });

    let commits = 0;
    render(
      <Profiler id="minimap" onRender={() => { commits += 1; }}>
        <Minimap def={def} boat={1} covered={false} />
      </Profiler>,
    );
    expect(draw).toHaveBeenCalledTimes(1);

    const mounted = commits;
    act(() => { setPlayerPos({ x: def.spawn.x + 8, y: def.spawn.y + 8 }); });

    expect(draw).toHaveBeenCalledTimes(2);
    expect(commits).toBe(mounted);
  });
});
