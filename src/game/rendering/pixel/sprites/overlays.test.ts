import { describe, it, expect } from 'vitest';
import { drawHookJump } from './overlays';
import type { GearView } from './overlays';
import { JUMP_S, jumpHeight } from './schoolView';
import { fishArt } from '../fishArt/index';
import { FISH } from '../../../content/fish';
import type { Ctx } from '../common';

function recorder() {
  const calls: string[] = [];
  let fillStyle = '';
  const ctx = {
    get fillStyle() { return fillStyle; },
    set fillStyle(v: string) { fillStyle = v; },
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push(`${fillStyle}@${x},${y},${w},${h}`);
    },
  };
  return { ctx: ctx as unknown as Ctx, calls };
}

const carp = FISH.find(f => f.id === 'carp')!;

function view(overrides: Partial<GearView> = {}): GearView {
  return {
    player: { x: 80, y: 80 },
    school: { id: 's1', spot: 'pond', x: 100, y: 80 },
    phase: 'catch',
    biteT: null,
    zone: 0.2,
    t: 0,
    catchT: 0.1,
    catchFish: { id: 'carp', form: 'normal' },
    fishArt: 'v1',
    ...overrides,
  };
}

describe('drawHookJump', () => {
  it('v1 스타일에서도 catch 중 점프 높이가 양수이면 물고기를 그린다(정점 전 flip: false)', () => {
    const catchT = 0.1;
    const h = jumpHeight(catchT);
    expect(h).toBeGreaterThan(0);
    expect(catchT).toBeLessThan(JUMP_S / 2);

    const actual = recorder(), expected = recorder();
    drawHookJump(actual.ctx, view({ catchT, fishArt: 'v1' }));
    fishArt('v1').drawCentered(expected.ctx, carp, 100, 80 - h, { scale: 1, form: 'normal', flip: false });

    expect(actual.calls.length).toBeGreaterThan(0);
    expect(actual.calls).toEqual(expected.calls);
  });

  it('v1 스타일에서 정점 이후에는 flip: true로 뒤집어 그린다', () => {
    const catchT = JUMP_S / 2 + 0.1;
    const h = jumpHeight(catchT);
    expect(h).toBeGreaterThan(0);

    const flipped = recorder(), expected = recorder(), unflipped = recorder();
    drawHookJump(flipped.ctx, view({ catchT, fishArt: 'v1' }));
    fishArt('v1').drawCentered(expected.ctx, carp, 100, 80 - h, { scale: 1, form: 'normal', flip: true });
    fishArt('v1').drawCentered(unflipped.ctx, carp, 100, 80 - h, { scale: 1, form: 'normal', flip: false });

    expect(flipped.calls).toEqual(expected.calls);
    expect(flipped.calls).not.toEqual(unflipped.calls);
  });

  it('변이 폼도 훅 점프에 반영한다', () => {
    const catchT = 0.15;
    const h = jumpHeight(catchT);
    const actual = recorder(), expected = recorder();
    drawHookJump(actual.ctx, view({ catchT, catchFish: { id: 'carp', form: 'variant' }, fishArt: 'v1' }));
    fishArt('v1').drawCentered(expected.ctx, carp, 100, 80 - h, { scale: 1, form: 'variant', flip: false });

    expect(actual.calls).toEqual(expected.calls);
  });

  it('catch 단계가 아니거나 점프 높이가 0이면 그리지 않는다', () => {
    const a = recorder(), b = recorder(), c = recorder();
    drawHookJump(a.ctx, view({ phase: 'bite' }));
    drawHookJump(b.ctx, view({ catchT: 0 }));
    drawHookJump(c.ctx, view({ catchT: JUMP_S }));

    expect(a.calls).toEqual([]);
    expect(b.calls).toEqual([]);
    expect(c.calls).toEqual([]);
  });
});
