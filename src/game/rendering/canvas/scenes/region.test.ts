import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderRegion, vignette } from './region';
import type { FieldView } from './region';
import { drawBoat, drawOtherPerson, drawOtherShip, drawPerson } from '../../pixel/sprites/actors.js';
import type { RegionPack } from '../../../world/types';
import type { RegionId } from '../../../content/places';
import { JUMP_S } from '../../pixel/sprites/schoolView';

vi.mock('../../pixel/sprites/actors.js', () => ({
  drawBoat: vi.fn(),
  drawIdle: vi.fn(),
  drawOtherPerson: vi.fn(),
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

    renderRegion(renderCtx(), { ...basePack('championship', 'walk'), showOthers: true }, {
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
      look: myLook,
      others: [peer],
    });
    expect(drawPerson).toHaveBeenCalledWith(expect.anything(), 20, 20, { shirt: 2, pants: 3, hat: 'santa-hat' });
    expect(drawOtherPerson).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ look: { shirt: 4, pants: 5, hat: 'santa-hat' } }),
      0,
    );
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
      look: myLook,
    });
    expect(drawBoat).toHaveBeenCalledWith(expect.anything(), 20, 20, 0, myLook);
  });
});

function makeRecordingCtx() {
  const calls: string[] = [];
  let fillStyle: unknown = '';
  const ctx = {
    get fillStyle() { return fillStyle; },
    set fillStyle(v: unknown) { fillStyle = v; },
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 20 })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect(x: number, y: number, w: number, h: number) {
      if (typeof fillStyle === 'string') calls.push(`${fillStyle}@${x},${y},${w},${h}`);
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const TEST_PACK: RegionPack = {
  id: 'village',
  name: '테스트',
  base: 'home',
  info: { shortName: '테스트', tagline: '', lore: '', tips: [], controls: [] },
  bounds: { x: 0, y: 0, w: 2000, h: 2000 },
  movement: 'walk',
  ground: { kind: 'grass', color: '#111111', dot: '#222222', mapColor: '#111111' },
  waveCount: 0,
  terrain: [],
  buildings: [],
  decorations: [],
  labels: [],
  triggers: [],
  spawn: { x: 500, y: 500 },
};

function baseFieldView(overrides: Partial<FieldView> = {}): FieldView {
  return {
    player: { x: 500, y: 500 },
    school: null,
    schools: [],
    boat: 1,
    phase: 'idle',
    biteT: null,
    zone: 0,
    t: 0,
    view: { w: 448, h: 252 },
    fishArt: 'v1',
    ...overrides,
  };
}

describe('renderRegion 점프 연출 뷰포트 컬링', () => {
  // player=(500,500), view=(448,252) -> cam=(276, 374)
  // 허용 범위: x in [244, 756], y in [326, 674]
  it('카메라 여백(x ±32, y ±48) 안의 localJumps·peerJumps는 그리고 밖은 컬링한다', () => {
    const inside = makeRecordingCtx();
    renderRegion(inside.ctx, TEST_PACK, baseFieldView({
      localJumps: [{ x: 244, y: 326, fishId: 'goldcarp', form: 'normal', t: JUMP_S / 2, intensity: 'large' }],
      peerJumps: [{ x: 756, y: 674, fishId: 'goldfish', form: 'normal', t: JUMP_S / 2, intensity: 'large' }],
    }));
    expect(inside.calls.some(c => c.startsWith('#ffd54f@'))).toBe(true);
    expect(inside.calls.some(c => c.startsWith('#ba68c8@'))).toBe(true);

    // 시작점(x=200)은 밖이지만 목표점(toX=500)이 카메라 안이면 컬링하지 않고 그린다
    const targetInside = makeRecordingCtx();
    renderRegion(targetInside.ctx, TEST_PACK, baseFieldView({
      localJumps: [{ x: 200, y: 500, toX: 500, toY: 494, fishId: 'goldcarp', form: 'normal', t: JUMP_S / 2, intensity: 'large' }],
    }));
    expect(targetInside.calls.some(c => c.startsWith('#ffd54f@'))).toBe(true);

    // 시작점(x=200)과 목표점(toX=800) 모두 밖이라도 현재 포물선 좌표가 카메라 안이면 그린다
    const midInside = makeRecordingCtx();
    renderRegion(midInside.ctx, TEST_PACK, baseFieldView({
      peerJumps: [{ x: 200, y: 500, toX: 800, toY: 500, fishId: 'goldfish', form: 'normal', t: JUMP_S / 2, intensity: 'large' }],
    }));
    expect(midInside.calls.some(c => c.startsWith('#ba68c8@'))).toBe(true);

    const outside = makeRecordingCtx();
    renderRegion(outside.ctx, TEST_PACK, baseFieldView({
      localJumps: [
        { x: 243, y: 500, fishId: 'goldcarp', form: 'normal', t: JUMP_S / 2, intensity: 'large' },
        { x: 757, y: 500, fishId: 'goldcarp', form: 'normal', t: JUMP_S / 2, intensity: 'large' },
      ],
      peerJumps: [
        { x: 500, y: 325, fishId: 'goldfish', form: 'normal', t: JUMP_S / 2, intensity: 'large' },
        { x: 500, y: 699, fishId: 'goldfish', form: 'normal', t: JUMP_S / 2, intensity: 'large' },
      ],
    }));
    expect(outside.calls.some(c => c.startsWith('#ffd54f@'))).toBe(false);
    expect(outside.calls.some(c => c.startsWith('#ba68c8@'))).toBe(false);
  });
});

describe('renderRegion groundDetail 호출 순서', () => {
  it('rect 지형 바탕·점 80개를 그린 직후, 물·데크·건물·장식·라벨·flavor 전에 groundDetail을 호출한다', () => {
    const rec = makeRecordingCtx();
    const order: string[] = [];
    const origFillRect = rec.ctx.fillRect.bind(rec.ctx);
    rec.ctx.fillRect = ((x: number, y: number, w: number, h: number) => {
      if (rec.ctx.fillStyle === '#111111' && w === 2000 && h === 2000) order.push('ground');
      else if (rec.ctx.fillStyle === '#222222') order.push('dot');
      else if (rec.ctx.fillStyle === '#3a7fc1') order.push('water');
      else if (rec.ctx.fillStyle === '#8d6e63') order.push('deck');
      else if (rec.ctx.fillStyle === '#a1887f') order.push('building');
      else if (rec.ctx.fillStyle === '#2d6a4f') order.push('decoration');
      origFillRect(x, y, w, h);
    }) as typeof rec.ctx.fillRect;
    rec.ctx.fillText = (() => { order.push('label'); }) as typeof rec.ctx.fillText;

    const pack: RegionPack = {
      ...TEST_PACK,
      terrain: [
        { kind: 'water', rect: { x: 10, y: 10, w: 20, h: 20 }, style: 'river' },
        { kind: 'deck', rect: { x: 40, y: 40, w: 16, h: 16 }, style: 'pier' },
      ],
      buildings: [{ rect: { x: 80, y: 80, w: 64, h: 52 }, sprite: 'house' }],
      decorations: [{ kind: 'tree', x: 180, y: 180 }],
      labels: [{ text: '테스트', x: 100, y: 70 }],
      groundDetail: (_ctx, t) => {
        order.push(`groundDetail:${t}`);
        rec.ctx.fillStyle = '#cedee9';
        rec.ctx.fillRect(0, 0, 8, 8);
      },
      flavor: () => { order.push('flavor'); },
    };

    renderRegion(rec.ctx, pack, baseFieldView({ t: 2.5 }));

    const gdIdx = order.indexOf('groundDetail:2.5');
    expect(gdIdx).toBeGreaterThan(-1);
    const dotLastIdx = order.lastIndexOf('dot');
    expect(order.filter(x => x === 'dot')).toHaveLength(80);
    expect(gdIdx).toBeGreaterThan(dotLastIdx);
    expect(gdIdx).toBeLessThan(order.indexOf('water'));
    expect(gdIdx).toBeLessThan(order.indexOf('deck'));
    expect(gdIdx).toBeLessThan(order.indexOf('building'));
    expect(gdIdx).toBeLessThan(order.indexOf('decoration'));
    expect(gdIdx).toBeLessThan(order.indexOf('label'));
    expect(gdIdx).toBeLessThan(order.indexOf('flavor'));
  });
});
