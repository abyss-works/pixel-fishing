import { describe, it, expect, vi } from 'vitest';
import { renderRegion, vignette } from './region';
import type { FieldView } from './region';
import type { RegionPack } from '../../../world/types';
import { JUMP_S } from '../../pixel/sprites/schoolView';

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
      localJumps: [{ x: 244, y: 326, fishId: 'goldcarp', form: 'normal', t: JUMP_S / 2 }],
      peerJumps: [{ x: 756, y: 674, fishId: 'goldfish', form: 'normal', t: JUMP_S / 2 }],
    }));
    expect(inside.calls.some(c => c.startsWith('#ffd54f@'))).toBe(true);
    expect(inside.calls.some(c => c.startsWith('#ba68c8@'))).toBe(true);

    const outside = makeRecordingCtx();
    renderRegion(outside.ctx, TEST_PACK, baseFieldView({
      localJumps: [
        { x: 243, y: 500, fishId: 'goldcarp', form: 'normal', t: JUMP_S / 2 },
        { x: 757, y: 500, fishId: 'goldcarp', form: 'normal', t: JUMP_S / 2 },
      ],
      peerJumps: [
        { x: 500, y: 325, fishId: 'goldfish', form: 'normal', t: JUMP_S / 2 },
        { x: 500, y: 675, fishId: 'goldfish', form: 'normal', t: JUMP_S / 2 },
      ],
    }));
    expect(outside.calls.some(c => c.startsWith('#ffd54f@'))).toBe(false);
    expect(outside.calls.some(c => c.startsWith('#ba68c8@'))).toBe(false);
  });

  it('localJumps가 전달되면 catch 단계라도 drawHookJump와 중복해 그리지 않는다', () => {
    const rec = makeRecordingCtx();
    renderRegion(rec.ctx, TEST_PACK, baseFieldView({
      phase: 'catch',
      school: { id: 's1', spot: 'pond', x: 500, y: 500 },
      catchT: JUMP_S / 2,
      catchFish: { id: 'goldfish', form: 'normal' },
      localJumps: [],
    }));
    expect(rec.calls.some(c => c.startsWith('#ba68c8@'))).toBe(false);
  });
});
