// prepareCatchDraw — 리듀서 catch와 서버 fast path가 공유하는 추첨 준비.
// 판정 강등·미끼·시간대를 한 곳에서 계산한다 (중복 구현 단일화).
import { describe, it, expect } from 'vitest';
import { prepareCatchDraw } from './actions';
import { newState } from './logic';
import type { GameState } from './logic';
import type { PowerZone } from './stats';

const NIGHT = '2026-01-01T13:05:00Z'; // time.test.ts — night
const DAY = '2026-12-31T23:40:00Z'; // time.test.ts — day
const COMMON = 'bait-common';

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });
const pz = (over: Partial<PowerZone> = {}): PowerZone =>
  ({ power: 10, req: 0, yellow: 10, red: 0, mult: 1, biteExtra: 0, ...over });

describe('prepareCatchDraw', () => {
  it('red 미개방에서 perfect는 yellow가 있으면 good, 없으면 normal으로 강등', () => {
    expect(prepareCatchDraw(seed(), 'pond', 'perfect', DAY, pz({ red: 0, yellow: 10 })).judgment).toBe('good');
    expect(prepareCatchDraw(seed(), 'pond', 'perfect', DAY, pz({ red: 0, yellow: 0 })).judgment).toBe('normal');
    expect(prepareCatchDraw(seed(), 'pond', 'perfect', DAY, pz({ red: 5 })).judgment).toBe('perfect');
  });

  it('yellow 미개방에서 good은 normal으로 강등', () => {
    expect(prepareCatchDraw(seed(), 'pond', 'good', DAY, pz({ yellow: 0 })).judgment).toBe('normal');
    expect(prepareCatchDraw(seed(), 'pond', 'good', DAY, pz({ yellow: 10 })).judgment).toBe('good');
  });

  it('auto에는 미끼 소모·효과가 없고, 수동에는 보유 미끼가 붙는다', () => {
    const s = seed({ items: { [COMMON]: 3 }, activeBait: COMMON });
    const auto = prepareCatchDraw(s, 'pond', 'auto', DAY, pz());
    expect(auto.bait).toBeUndefined();
    expect(auto.phaseOpts.budgets).toBeUndefined();
    const manual = prepareCatchDraw(s, 'pond', 'perfect', DAY, pz());
    expect(manual.bait?.id).toBe(COMMON);
    expect(Object.keys(manual.phaseOpts.budgets ?? {})).toHaveLength(1);
  });

  it('서버 시각으로 시간대를 가른다', () => {
    expect(prepareCatchDraw(seed(), 'pond', 'normal', NIGHT, pz()).phaseOpts.phase).toBe('night');
    expect(prepareCatchDraw(seed(), 'pond', 'normal', DAY, pz()).phaseOpts.phase).toBe('day');
  });
});
