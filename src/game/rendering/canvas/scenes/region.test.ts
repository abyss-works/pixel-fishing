import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderRegion, vignette } from './region';
import { drawBoat, drawOtherShip, drawPerson } from '../../pixel/sprites/actors.js';
import type { RegionPack } from '../../../world/types';
import type { RegionId } from '../../../content/places';

vi.mock('../../pixel/sprites/actors.js', () => ({
  drawBoat: vi.fn(),
  drawIdle: vi.fn(),
  drawOtherShip: vi.fn(),
  drawPerson: vi.fn(),
  drawSpeech: vi.fn(),
}));

const stubCtx = () => ({
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
}) as unknown as CanvasRenderingContext2D;

describe('vignette', () => {
  it('같은 ctx에는 1회만 생성한다', () => {
    const ctx = stubCtx();
    vignette(ctx);
    vignette(ctx);
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(1);
  });

  it('다른 ctx에는 각각 생성한다', () => {
    const a = stubCtx();
    const b = stubCtx();
    vignette(a);
    vignette(b);
    expect(a.createRadialGradient).toHaveBeenCalledTimes(1);
    expect(b.createRadialGradient).toHaveBeenCalledTimes(1);
  });
});

describe('vignette 크기', () => {
  it('캔버스 크기가 바뀌면 다시 생성한다', () => {
    const ctx = stubCtx();
    vignette(ctx, 504, 904);
    vignette(ctx, 504, 904);
    vignette(ctx, 504, 800);
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(2);
  });
});

describe('vignette 반지름', () => {
  const radii = (w: number, h: number) => {
    const ctx = stubCtx();
    vignette(ctx, w, h);
    const [, , r0, , , r1] = (ctx.createRadialGradient as unknown as { mock: { calls: number[][] } }).mock.calls[0];
    return { r0, r1 };
  };

  it('PC 시야는 안쪽 0.38h, 바깥쪽 0.62w를 유지한다', () => {
    const { r0, r1 } = radii(896, 504);
    expect(r0).toBeCloseTo(504 * 0.38);
    expect(r1).toBeCloseTo(896 * 0.62);
  });

  it('세로로 긴 모바일 시야에서도 바깥 반지름이 안쪽보다 크다', () => {
    for (const [w, h] of [[504, 904], [504, 1100], [504, 416]]) {
      const { r0, r1 } = radii(w, h);
      expect(r1).toBeGreaterThan(r0);
    }
  });
});

describe('renderRegion 구역 강제 모자 덮어쓰기', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const renderCtx = () => ({
    setTransform: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  }) as unknown as CanvasRenderingContext2D;

  const basePack = (id: string, movement: 'walk' | 'sail'): RegionPack => ({
    id: id as RegionId,
    name: id,
    base: 'home',
    info: { shortName: id, tagline: '', lore: '', tips: [], controls: [] },
    bounds: { x: 0, y: 0, w: 100, h: 100 },
    movement,
    ground: { kind: 'grass', color: '#000', dot: '#000', mapColor: '#000' },
    waveCount: 0,
    terrain: [],
    buildings: [],
    decorations: [],
    spawn: { x: 20, y: 20 },
    triggers: [],
    labels: [],
  });

  it('championship 구역에서는 도보·항해·다른 배의 모자를 santa-hat으로 덮어쓰고 입력 객체를 변이하지 않는다', () => {
    const myLook = { shirt: 2, pants: 3, hat: 'cap-red' };
    const peerLook = { shirt: 4, pants: 5, hat: null };
    const peer = { x: 30, y: 30, nick: 'p', line: false, stale: false, look: peerLook };

    renderRegion(renderCtx(), basePack('championship', 'sail'), {
      boat: 1,
      schools: [],
      player: { x: 20, y: 20 },
      phase: 'idle',
      school: null,
      biteT: null,
      zone: 0,
      red: 0,
      redCenter: 0.5,
      t: 0,
      catchT: null,
      catchFish: null,
      look: myLook,
      others: [peer],
    });

    expect(drawBoat).toHaveBeenCalledWith(expect.anything(), 20, 20, 0, { shirt: 2, pants: 3, hat: 'santa-hat' });
    expect(drawOtherShip).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ look: { shirt: 4, pants: 5, hat: 'santa-hat' } }),
      0,
    );
    expect(myLook.hat).toBe('cap-red');
    expect(peerLook.hat).toBeNull();

    renderRegion(renderCtx(), basePack('championship', 'walk'), {
      boat: 1,
      schools: [],
      player: { x: 20, y: 20 },
      phase: 'idle',
      school: null,
      biteT: null,
      zone: 0,
      red: 0,
      redCenter: 0.5,
      t: 0,
      catchT: null,
      catchFish: null,
      look: myLook,
    });
    expect(drawPerson).toHaveBeenCalledWith(expect.anything(), 20, 20, { shirt: 2, pants: 3, hat: 'santa-hat' });
  });

  it('일반 구역에서는 look의 모자를 유지한다', () => {
    const myLook = { shirt: 1, pants: 1, hat: 'cap-blue' };
    renderRegion(renderCtx(), basePack('world', 'sail'), {
      boat: 1,
      schools: [],
      player: { x: 20, y: 20 },
      phase: 'idle',
      school: null,
      biteT: null,
      zone: 0,
      red: 0,
      redCenter: 0.5,
      t: 0,
      catchT: null,
      catchFish: null,
      look: myLook,
    });
    expect(drawBoat).toHaveBeenCalledWith(expect.anything(), 20, 20, 0, myLook);
  });
});
