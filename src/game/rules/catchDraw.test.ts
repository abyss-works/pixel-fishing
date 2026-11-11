// prepareCatchDraw — 리듀서 catch와 서버 fast path가 공유하는 추첨 준비.
// 판정 강등·시간대를 한 곳에서 계산한다 (중복 구현 단일화).
import { describe, it, expect } from 'vitest';
import { prepareCatchDraw } from './actions';
import { newState } from './logic';
import type { PowerZone } from './stats';

const NIGHT = '2026-01-01T13:05:00Z'; // night
const DAY = '2026-12-31T23:40:00Z'; // day

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

  it('추첨 옵션은 시간대만 담는다 — 수동도 방치도 등급 효과를 걸지 않는다', () => {
    for (const judgment of ['auto', 'perfect'] as const) {
      expect(prepareCatchDraw(newState(), judgment, DAY, pz()).phaseOpts).toEqual({ phase: 'day' });
    }
  });

  it('서버 시각으로 시간대를 가른다', () => {
    expect(prepareCatchDraw(newState(), 'normal', NIGHT, pz()).phaseOpts.phase).toBe('night');
    expect(prepareCatchDraw(newState(), 'normal', DAY, pz()).phaseOpts.phase).toBe('day');
  });
});
