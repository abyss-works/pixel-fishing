import { describe, it, expect } from 'vitest';
import { drawHookJump, drawSchools, drawTimingBar } from './overlays';
import type { GearView } from './overlays';
import { JUMP_S, jumpHeight } from './schoolView';
import { fishArt } from '../fishArt/index';
import { FISH } from '../../../content/fish';
import { eventFishById } from '../../../content/eventFish';
import type { SpotId } from '../../../content/spots';
import type { Ctx } from '../common';

function recorder() {
  const calls: string[] = [];
  let fillStyle = '';
  const ctx = {
    font: '',
    textAlign: 'left',
    get fillStyle() { return fillStyle; },
    set fillStyle(v: string) { fillStyle = v; },
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push(`${fillStyle}@${x},${y},${w},${h}`);
    },
    fillText(text: string, x: number, y: number) {
      calls.push(`text:${fillStyle}@${x},${y}:${text}`);
    },
  };
  return { ctx: ctx as unknown as Ctx, calls };
}

const carp = FISH.find(f => f.id === 'carp')!;
const glaaki = eventFishById('event-glaaki')!;

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

  it('이벤트 어종(event-glaaki)도 훅 점프에 그린다', () => {
    const catchT = 0.12;
    const h = jumpHeight(catchT);
    const actual = recorder(), expected = recorder();
    drawHookJump(actual.ctx, view({
      school: { id: 'ch-1', spot: 'championship', x: 152, y: 140 },
      catchT,
      catchFish: { id: 'event-glaaki', form: 'normal' },
      fishArt: 'v1',
    }));
    fishArt('v1').drawCentered(expected.ctx, glaaki, 152, 140 - h, { scale: 1, form: 'normal', flip: false });

    expect(actual.calls.length).toBeGreaterThan(0);
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

describe('drawSchools', () => {
  it('championship 이벤트 수역 어군도 spotById로 조회해 오류 없이 그린다', () => {
    const actual = recorder();
    expect(() => drawSchools(actual.ctx, [{ id: 'ch-1', spot: 'championship', x: 152, y: 140 }], 0, 0)).not.toThrow();
    expect(actual.calls.length).toBeGreaterThan(0);
    expect(actual.calls.some(call => call.startsWith('text:'))).toBe(false);
    expect(actual.calls.some(call => call.startsWith('rgba(8,25,38,0.55)@'))).toBe(true);
  });

  it('알 수 없는 수역 id가 와도 크래시 없이 기본 열린 상태로 그린다', () => {
    const actual = recorder();
    const unknownSpot = 'unknown-spot' as SpotId;
    expect(() => drawSchools(actual.ctx, [{ id: 'u-1', spot: unknownSpot, x: 100, y: 100 }], 0, 0)).not.toThrow();
    expect(actual.calls.some(call => call.startsWith('text:'))).toBe(false);
    expect(actual.calls.some(call => call.startsWith('rgba(8,25,38,0.55)@'))).toBe(true);
  });
});


describe('drawTimingBar', () => {
  it('빨간 존 중심이 주어지면 중앙이 아니라 그 비율 위치에 그린다', () => {
    const actual = recorder();
    drawTimingBar(actual.ctx, view({ phase: 'bite', biteT: 0.5, catchT: null, zone: 0.4, red: 0.1, redCenter: 0.6 }));
    const red = actual.calls.find(call => call.startsWith('rgba(239,83,80,0.9)@'));
    expect(red).toBe('rgba(239,83,80,0.9)@82,92,4.4,5');
  });

  it('빨간 존 중심이 없으면 기존처럼 바 중앙에 그린다', () => {
    const actual = recorder();
    drawTimingBar(actual.ctx, view({ phase: 'bite', biteT: 0.5, catchT: null, zone: 0.4, red: 0.1 }));
    const red = actual.calls.find(call => call.startsWith('rgba(239,83,80,0.9)@'));
    expect(red).toBe('rgba(239,83,80,0.9)@77,92,4.4,5');
  });
});
