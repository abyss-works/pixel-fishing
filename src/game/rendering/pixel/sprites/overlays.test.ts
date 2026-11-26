import { describe, it, expect } from 'vitest';
import { drawFishJump, drawHookJump, drawTimingBar } from './overlays';
import type { GearView, JumpFx } from './overlays';
import { JUMP_PX, JUMP_S, jumpHeight } from './schoolView';
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

const crucian = FISH.find(f => f.id === 'crucian')!; // common
const carp = FISH.find(f => f.id === 'carp')!;       // rare
const goldfish = FISH.find(f => f.id === 'goldfish')!; // epic
const goldcarp = FISH.find(f => f.id === 'goldcarp')!; // legendary

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
  it('v1 스타일에서도 catch 중 점프 높이가 양수이면 2배 크기 물고기를 그린다(정점 전 flip: false)', () => {
    expect(JUMP_S).toBe(0.9);
    expect(JUMP_PX).toBe(24);
    const catchT = JUMP_S / 2 - 0.1;
    const h = jumpHeight(catchT);
    expect(h).toBeGreaterThan(0);

    const actual = recorder(), expected = recorder();
    drawHookJump(actual.ctx, view({ catchT, fishArt: 'v1' }));
    fishArt('v1').drawCentered(expected.ctx, carp, 100, 80 - h, { scale: 2, form: 'normal', flip: false });

    expect(actual.calls.length).toBeGreaterThan(0);
    expect(actual.calls).toEqual(expected.calls);
  });

  it('v1 스타일에서 정점 이후에는 flip: true로 2배 크기 물고기를 뒤집어 그린다', () => {
    const catchT = JUMP_S / 2 + 0.1;
    const h = jumpHeight(catchT);
    expect(h).toBeGreaterThan(0);

    const flipped = recorder(), expected = recorder(), unflipped = recorder();
    drawHookJump(flipped.ctx, view({ catchT, fishArt: 'v1' }));
    fishArt('v1').drawCentered(expected.ctx, carp, 100, 80 - h, { scale: 2, form: 'normal', flip: true });
    fishArt('v1').drawCentered(unflipped.ctx, carp, 100, 80 - h, { scale: 2, form: 'normal', flip: false });

    expect(flipped.calls).toEqual(expected.calls);
    expect(flipped.calls).not.toEqual(unflipped.calls);
  });

  it('변이 폼은 2배 크기 물고기와 마젠타 스파클을 함께 그린다', () => {
    const catchT = JUMP_S / 2;
    const h = jumpHeight(catchT);
    const actual = recorder(), fishOnly = recorder();
    drawHookJump(actual.ctx, view({ catchT, catchFish: { id: 'carp', form: 'variant' }, fishArt: 'v1' }));
    fishArt('v1').drawCentered(fishOnly.ctx, carp, 100, 80 - h, { scale: 2, form: 'variant', flip: false });

    for (const call of fishOnly.calls) expect(actual.calls).toContain(call);
    expect(actual.calls.some(call => call.startsWith('#f472b6@'))).toBe(true);
  });

  it('catch 단계가 아니거나 점프 시간 범위 밖이면 그리지 않는다', () => {
    const a = recorder(), b = recorder(), c = recorder();
    drawHookJump(a.ctx, view({ phase: 'bite' }));
    drawHookJump(b.ctx, view({ catchT: -0.01 }));
    drawHookJump(c.ctx, view({ catchT: JUMP_S }));

    expect(a.calls).toEqual([]);
    expect(b.calls).toEqual([]);
    expect(c.calls).toEqual([]);
  });
});

describe('drawFishJump', () => {
  const jump = (overrides: Partial<JumpFx> = {}): JumpFx => ({
    x: 100, y: 80, fishId: 'crucian', form: 'normal', t: JUMP_S / 2, ...overrides,
  });

  it('이륙(t < 0.25)과 착수(t > JUMP_S - 0.22) 구간에서만 수면 물방울을 그린다', () => {
    const fishMid = recorder(), takeoff = recorder(), mid = recorder(), landing = recorder();
    fishArt('v1').drawCentered(fishMid.ctx, crucian, 100, 80 - jumpHeight(JUMP_S / 2), { scale: 2, form: 'normal', flip: false });

    drawFishJump(takeoff.ctx, jump({ t: 0.1 }), 'v1');
    drawFishJump(mid.ctx, jump({ t: JUMP_S / 2 }), 'v1');
    drawFishJump(landing.ctx, jump({ t: JUMP_S - 0.1 }), 'v1');

    expect(mid.calls).toEqual(fishMid.calls);
    expect(takeoff.calls.length).toBeGreaterThan(fishMid.calls.length);
    expect(landing.calls.length).toBeGreaterThan(fishMid.calls.length);
  });

  it('일반·희귀 어종은 스파크 없이 물보라만 그린다', () => {
    for (const fish of [crucian, carp]) {
      const rec = recorder();
      drawFishJump(rec.ctx, jump({ fishId: fish.id, t: 0.1 }), 'v1');
      expect(rec.calls.some(c => c.startsWith('#ba68c8@'))).toBe(false);
      expect(rec.calls.some(c => c.startsWith('#ffd54f@'))).toBe(false);
      expect(rec.calls.some(c => c.startsWith('#f472b6@'))).toBe(false);
    }
  });

  it('영웅은 보라(#ba68c8), 전설은 금빛(#ffd54f), 변이는 마젠타(#f472b6) 스파크를 그린다', () => {
    const epicRec = recorder();
    drawFishJump(epicRec.ctx, jump({ fishId: goldfish.id, form: 'normal', t: JUMP_S / 2 }), 'v1');
    expect(epicRec.calls.some(c => c.startsWith('#ba68c8@'))).toBe(true);
    expect(epicRec.calls.some(c => c.startsWith('#ffd54f@'))).toBe(false);
    expect(epicRec.calls.some(c => c.startsWith('#f472b6@'))).toBe(false);

    const legendRec = recorder();
    drawFishJump(legendRec.ctx, jump({ fishId: goldcarp.id, form: 'normal', t: JUMP_S / 2 }), 'v1');
    expect(legendRec.calls.some(c => c.startsWith('#ffd54f@'))).toBe(true);
    expect(legendRec.calls.some(c => c.startsWith('#ba68c8@'))).toBe(false);
    expect(legendRec.calls.some(c => c.startsWith('#f472b6@'))).toBe(false);

    const variantLegendRec = recorder();
    drawFishJump(variantLegendRec.ctx, jump({ fishId: goldcarp.id, form: 'variant', t: JUMP_S / 2 }), 'v1');
    expect(variantLegendRec.calls.some(c => c.startsWith('#ffd54f@'))).toBe(true);
    expect(variantLegendRec.calls.some(c => c.startsWith('#f472b6@'))).toBe(true);
  });

  it('존재하지 않는 어종이거나 t 범위 밖이면 아무것도 그리지 않는다', () => {
    const a = recorder(), b = recorder(), c = recorder();
    drawFishJump(a.ctx, jump({ fishId: 'no-such-fish' }), 'v1');
    drawFishJump(b.ctx, jump({ t: -0.05 }), 'v1');
    drawFishJump(c.ctx, jump({ t: JUMP_S }), 'v1');

    expect(a.calls).toEqual([]);
    expect(b.calls).toEqual([]);
    expect(c.calls).toEqual([]);
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
