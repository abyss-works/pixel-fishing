import { describe, it, expect } from 'vitest';
import { BLOOM_COUNT, BLOOM_TOTAL_S, drawFishJump, drawSchools, drawTimingBar, goldBloomParticles, jumpPoint } from './overlays';
import type { GearView, JumpFx } from './overlays';
import { JUMP_S, jumpHeight } from './schoolView';
import { fishArt } from '../fishArt/index';
import { FISH } from '../../../content/fish';
import { eventFishById } from '../../../content/eventFish';
import type { SpotId } from '../../../content/spots';
import type { Ctx } from '../common';
import { CATCH_MS_LEGENDARY } from '../../../rules/balance';

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

const crucian = FISH.find(f => f.id === 'crucian')!; // common
const carp = FISH.find(f => f.id === 'carp')!;       // rare
const goldfish = FISH.find(f => f.id === 'goldfish')!; // epic
const goldcarp = FISH.find(f => f.id === 'goldcarp')!; // legendary
const glaaki = eventFishById('event-glaaki')!;

function view(overrides: Partial<GearView> = {}): GearView {
  return {
    player: { x: 80, y: 80 },
    school: { id: 's1', spot: 'pond', x: 100, y: 80 },
    phase: 'catch',
    biteT: null,
    zone: 0.2,
    t: 0,
    fishArt: 'v1',
    ...overrides,
  };
}

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

describe('drawFishJump', () => {
  const jump = (overrides: Partial<JumpFx> = {}): JumpFx => ({
    x: 100, y: 80, fishId: 'crucian', form: 'normal', t: JUMP_S / 2, intensity: 'large', ...overrides,
  });

  it('제자리 폴백(목표 없음)에서는 이륙·착수 물보라와 정점 이후 반전을 유지한다', () => {
    const fishMid = recorder(), fishAfter = recorder();
    const takeoff = recorder(), mid = recorder(), landing = recorder();
    fishArt('v1').drawCentered(fishMid.ctx, crucian, 100, 80 - jumpHeight(JUMP_S / 2), { scale: 1, form: 'normal', flip: false });
    fishArt('v1').drawCentered(fishAfter.ctx, crucian, 100, 80 - jumpHeight(JUMP_S - 0.1), { scale: 1, form: 'normal', flip: true });

    drawFishJump(takeoff.ctx, jump({ t: 0.1 }), 'v1');
    drawFishJump(mid.ctx, jump({ t: JUMP_S / 2 }), 'v1');
    drawFishJump(landing.ctx, jump({ t: JUMP_S - 0.1 }), 'v1');

    expect(mid.calls).toEqual(fishMid.calls);
    expect(takeoff.calls.length).toBeGreaterThan(fishMid.calls.length);
    expect(landing.calls.length).toBeGreaterThan(fishAfter.calls.length);
    for (const call of fishAfter.calls) expect(landing.calls).toContain(call);
  });

  it('목표 이동(거리 4px 이상) 시 이륙 물보라는 그리고 착수 물보라는 그리지 않는다', () => {
    const tEnd = JUMP_S - 0.1;
    const uEnd = tEnd / JUMP_S;
    const ex = Math.round(100 + (160 - 100) * uEnd);
    const ey = Math.round(80 + (74 - 80) * uEnd) - jumpHeight(tEnd);

    const takeoff = recorder(), landing = recorder(), fishOnly = recorder();
    drawFishJump(takeoff.ctx, jump({ toX: 160, toY: 74, t: 0.1 }), 'v1');
    drawFishJump(landing.ctx, jump({ toX: 160, toY: 74, t: tEnd }), 'v1');
    fishArt('v1').drawCentered(fishOnly.ctx, crucian, ex, ey, { scale: 1, form: 'normal', flip: true });

    expect(takeoff.calls.some(c => c.startsWith('#b2ebf2@'))).toBe(true);
    expect(landing.calls).toEqual(fishOnly.calls);
    expect(landing.calls.some(c => c.startsWith('#b2ebf2@'))).toBe(false);
  });

  it('일반·희귀 어종(일반·변이 모두)은 스파크 없이 물보라와 물고기만 그린다', () => {
    for (const fish of [crucian, carp]) {
      for (const form of ['normal', 'variant'] as const) {
        const rec = recorder();
        drawFishJump(rec.ctx, jump({ fishId: fish.id, form, toX: 160, toY: 74, t: JUMP_S / 2 }), 'v1');
        expect(rec.calls.some(c => c.startsWith('#ba68c8@'))).toBe(false);
        expect(rec.calls.some(c => c.startsWith('#ffd54f@'))).toBe(false);
        expect(rec.calls.some(c => c.startsWith('#f472b6@'))).toBe(false);
      }
    }
  });

  it('영웅은 보라(#ba68c8), 전설은 금빛(#ffd54f·#fff8e1) 꼬리 스파크를 지나온 궤적 쪽에 그리고 변이 분홍 스파크는 없다', () => {
    const parseCoords = (calls: string[], prefix: string) =>
      calls.filter(c => c.startsWith(prefix)).map(c => {
        const [x, y] = c.slice(prefix.length).split(',').map(Number);
        return { x, y };
      });

    // (100,80) -> (200,80), t=0.45 -> 현재 물고기 중심 x=150, 과거 궤적은 x in [100, 150)
    const epicRec = recorder();
    drawFishJump(epicRec.ctx, jump({ fishId: goldfish.id, form: 'normal', toX: 200, toY: 80, t: JUMP_S / 2 }), 'v1');
    const epicCoords = parseCoords(epicRec.calls, '#ba68c8@');
    expect(epicCoords.length).toBeGreaterThan(0);
    expect(epicCoords.every(p => p.x >= 100 && p.x < 150)).toBe(true);
    expect(epicRec.calls.some(c => c.startsWith('#ffd54f@'))).toBe(false);
    expect(epicRec.calls.some(c => c.startsWith('#fff8e1@'))).toBe(false);
    expect(epicRec.calls.some(c => c.startsWith('#f472b6@'))).toBe(false);

    const legendRec = recorder();
    drawFishJump(legendRec.ctx, jump({ fishId: goldcarp.id, form: 'normal', toX: 200, toY: 80, t: JUMP_S / 2 }), 'v1');
    const legendCoords = parseCoords(legendRec.calls, '#ffd54f@');
    expect(legendCoords.length).toBeGreaterThan(0);
    expect(legendCoords.every(p => p.x >= 100 && p.x < 150)).toBe(true);
    expect(legendRec.calls.some(c => c.startsWith('#fff8e1@'))).toBe(true);
    expect(legendRec.calls.some(c => c.startsWith('#ba68c8@'))).toBe(false);
    expect(legendRec.calls.some(c => c.startsWith('#f472b6@'))).toBe(false);

    const variantLegendRec = recorder();
    drawFishJump(variantLegendRec.ctx, jump({ fishId: goldcarp.id, form: 'variant', toX: 200, toY: 80, t: JUMP_S / 2 }), 'v1');
    expect(variantLegendRec.calls.some(c => c.startsWith('#ffd54f@'))).toBe(true);
    expect(variantLegendRec.calls.some(c => c.startsWith('#f472b6@'))).toBe(false);
  });

  it('작게 강도는 영웅·전설도 꼬리 스파크 없이 물고기만 그린다', () => {
    for (const fish of [goldfish, goldcarp]) {
      const small = recorder(), fishOnly = recorder();
      drawFishJump(small.ctx, jump({ fishId: fish.id, toX: 200, toY: 80, intensity: 'small' }), 'v1');
      const pt = jumpPoint({ x: 100, y: 80, toX: 200, toY: 80 }, JUMP_S / 2);
      fishArt('v1').drawCentered(fishOnly.ctx, fish, pt.x, pt.y, { scale: 1, form: 'normal', flip: true });
      expect(small.calls).toEqual(fishOnly.calls);
    }
  });

  it('크게와 가장 크게 강도는 영웅·전설 꼬리 스파크를 그린다', () => {
    for (const intensity of ['large', 'largest'] as const) {
      const epic = recorder(), legend = recorder();
      drawFishJump(epic.ctx, jump({ fishId: goldfish.id, toX: 200, toY: 80, intensity }), 'v1');
      drawFishJump(legend.ctx, jump({ fishId: goldcarp.id, toX: 200, toY: 80, intensity }), 'v1');
      expect(epic.calls.some(c => c.startsWith('#ba68c8@'))).toBe(true);
      expect(legend.calls.some(c => c.startsWith('#ffd54f@'))).toBe(true);
    }
  });

  it('이벤트 어종(event-glaaki)도 전설 스파크와 함께 그린다', () => {
    const actual = recorder(), fishOnly = recorder();
    const pt = jumpPoint({ x: 152, y: 140, toX: 80, toY: 74 }, JUMP_S / 2 - 0.1);
    drawFishJump(actual.ctx, jump({ fishId: 'event-glaaki', x: 152, y: 140, toX: 80, toY: 74, t: JUMP_S / 2 - 0.1 }), 'v1');
    fishArt('v1').drawCentered(fishOnly.ctx, glaaki, pt.x, pt.y, { scale: 1, form: 'normal', flip: false });
    for (const call of fishOnly.calls) expect(actual.calls).toContain(call);
    expect(actual.calls.some(call => call.startsWith('#ffd54f@'))).toBe(true);
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
    drawTimingBar(actual.ctx, view({ phase: 'bite', biteT: 0.5, zone: 0.4, red: 0.1, redCenter: 0.6 }));
    const red = actual.calls.find(call => call.startsWith('rgba(239,83,80,0.9)@'));
    expect(red).toBe('rgba(239,83,80,0.9)@82,92,4.4,5');
  });

  it('빨간 존 중심이 없으면 기존처럼 바 중앙에 그린다', () => {
    const actual = recorder();
    drawTimingBar(actual.ctx, view({ phase: 'bite', biteT: 0.5, zone: 0.4, red: 0.1 }));
    const red = actual.calls.find(call => call.startsWith('rgba(239,83,80,0.9)@'));
    expect(red).toBe('rgba(239,83,80,0.9)@77,92,4.4,5');
  });
});

describe('goldBloomParticles', () => {
  const at = (age: number) => goldBloomParticles(age, 100, 80);

  it('배에 닿기 전과 끝난 뒤에는 입자가 없다', () => {
    expect(at(-0.01)).toEqual([]);
    expect(at(BLOOM_TOTAL_S)).toEqual([]);
  });

  it('피어오르는 동안 입자는 정수 크기의 정사각형이고 시간이 지날수록 위로 오른다', () => {
    const early = at(0.5);
    expect(early.length).toBeGreaterThan(0);
    expect(early.length).toBeLessThanOrEqual(BLOOM_COUNT);
    for (const p of early) {
      expect(Number.isInteger(p.size)).toBe(true);
      expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
    }
    const minY = (age: number) => Math.min(...at(age).map(p => p.y));
    expect(minY(0.9)).toBeLessThan(minY(0.4));
  });

  it('같은 시각은 같은 입자를 낸다', () => {
    expect(at(0.7)).toEqual(at(0.7));
  });

  it('전체 길이는 전설 잡기 홀드 안에 끝난다', () => {
    expect(JUMP_S + BLOOM_TOTAL_S).toBeLessThanOrEqual(CATCH_MS_LEGENDARY / 1000);
  });
});
