// prepareCatchDraw — 리듀서 catch와 서버 fast path가 공유하는 추첨 준비.
// 판정 강등·시간대·nightDepth를 한 곳에서 계산한다 (중복 구현 단일화).
import { describe, it, expect } from 'vitest';
import { applyAction, prepareCatchDraw } from './actions';
import { newState } from './logic';
import { SPECIES_PITY_K } from './pity';
import type { PowerZone } from './stats';

const NIGHT_START = '2026-01-01T13:55:00Z'; // 22:00 (nightDepth = 0)
const NIGHT_MID = '2026-01-01T13:00:00Z';   // 00:00 (nightDepth = 0.5)
const NIGHT_PEAK = '2026-01-01T13:05:00Z';  // 02:00 (nightDepth = 1)
const DAY = '2026-12-31T23:40:00Z';         // day (16:00)

const pz = (over: Partial<PowerZone> = {}): PowerZone =>
  ({ power: 10, req: 0, yellow: 10, red: 0, mult: 1, biteExtra: 0, ...over });

describe('prepareCatchDraw', () => {
  it('red 미개방에서 perfect는 yellow가 있으면 good, 없으면 normal으로 강등', () => {
    expect(prepareCatchDraw(newState(), 'perfect', DAY, pz({ red: 0, yellow: 10 })).judgment).toBe('good');
    expect(prepareCatchDraw(newState(), 'perfect', DAY, pz({ red: 0, yellow: 0 })).judgment).toBe('normal');
    expect(prepareCatchDraw(newState(), 'perfect', DAY, pz({ red: 5 })).judgment).toBe('perfect');
  });

  it('yellow 미개방에서 good은 normal으로 강등', () => {
    expect(prepareCatchDraw(newState(), 'good', DAY, pz({ yellow: 0 })).judgment).toBe('normal');
    expect(prepareCatchDraw(newState(), 'good', DAY, pz({ yellow: 10 })).judgment).toBe('good');
  });

  it('추첨 옵션은 낮에는 시간대만 담는다 — 수동도 방치도 등급 효과를 걸지 않는다', () => {
    for (const judgment of ['auto', 'perfect'] as const) {
      expect(prepareCatchDraw(newState(), judgment, DAY, pz()).phaseOpts).toEqual({ phase: 'day' });
    }
  });

  it('서버 시각으로 시간대와 nightDepth를 계산한다', () => {
    expect(prepareCatchDraw(newState(), 'normal', NIGHT_START, pz()).phaseOpts).toEqual({ phase: 'night', nightDepth: 0 });
    expect(prepareCatchDraw(newState(), 'normal', NIGHT_MID, pz()).phaseOpts).toEqual({ phase: 'night', nightDepth: 0.5 });
    expect(prepareCatchDraw(newState(), 'normal', NIGHT_PEAK, pz()).phaseOpts).toEqual({ phase: 'night', nightDepth: 1 });
    expect(prepareCatchDraw(newState(), 'normal', DAY, pz()).phaseOpts).toEqual({ phase: 'day' });
  });

  it('밤 어종 출현 미끼와 forcePhase=night는 nightDepth=1로 고정한다', () => {
    const withNightBait = {
      ...newState(),
      slots: { lunch: null, bait: { id: 'cook-bait-night', endsAt: '2026-01-01T15:00:00Z' } },
    };
    expect(prepareCatchDraw(withNightBait, 'normal', NIGHT_START, pz()).phaseOpts).toEqual({ phase: 'night', nightDepth: 1 });
    expect(prepareCatchDraw(withNightBait, 'normal', '2026-01-01T13:30:00Z', pz()).phaseOpts).toEqual({ phase: 'night', nightDepth: 1 });
    expect(prepareCatchDraw(newState(), 'auto', DAY, pz(), 'night').phaseOpts).toEqual({ phase: 'night', nightDepth: 1 });
    expect(prepareCatchDraw(newState(), 'auto', NIGHT_START, pz(), 'night').phaseOpts).toEqual({ phase: 'night', nightDepth: 1 });
  });

  it('22:00 경계(nightDepth=0) 캐치는 밤 어종을 천장 확정 후보에서 제외하고 누적도 하지 않는다', () => {
    const st = { ...newState(), boat: 2, pity: { moonveil: SPECIES_PITY_K } };
    const out = applyAction(st, { type: 'catch', spot: 'sea', judgment: 'auto' }, {
      rng: () => 0.999999,
      today: '2026-01-01',
      now: NIGHT_START,
      newUid: () => 'uid-1',
    });
    if (!out.ok) throw new Error(out.error);
    expect(out.result.type).toBe('catch');
    if (out.result.type === 'catch') expect(out.result.fishId).not.toBe('moonveil');
    expect(out.state.pity.moonveil).toBe(SPECIES_PITY_K);
  });
});
