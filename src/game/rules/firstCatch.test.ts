// 마을 해역별 첫 경험 보장 — 마을 연못·마을 강 각각 5번째 캐치에서 영웅, 정해진 10~15번째 캐치에서 전설.
import { describe, it, expect } from 'vitest';
import {
  FIRST_CATCH_EPIC_AT, FIRST_CATCH_LEGEND_MAX, FIRST_CATCH_LEGEND_MIN, FIRST_CATCH_SPOTS,
  endedFirstCatch, firstCatchTarget, fixedFirstCatch, hasPendingFirstCatch, newFirstCatch, settleFirstCatch,
} from './firstCatch';
import type { FirstCatch, FirstCatchSpot, FirstCatchSpotId } from './firstCatch';
import { drawCatch } from './actions';
import { FISH } from '../content/fish';

const rngOf = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };
const spotAt = (spot: FirstCatchSpotId, n: number, over: Partial<FirstCatchSpot> = {}): FirstCatch => ({
  ...newFirstCatch(),
  [spot]: { n, legendAt: 12, epic: true, legend: true, ...over },
});

describe('상수 및 헬퍼', () => {
  it('보장 대상 해역은 마을 연못과 마을 강이고 전설 구간은 10~15다', () => {
    expect(FIRST_CATCH_SPOTS).toEqual(['pond', 'river']);
    expect(FIRST_CATCH_EPIC_AT).toBe(5);
    expect(FIRST_CATCH_LEGEND_MIN).toBe(10);
    expect(FIRST_CATCH_LEGEND_MAX).toBe(15);
  });

  it('hasPendingFirstCatch와 fixedFirstCatch가 해역별 상태를 반영한다', () => {
    expect(hasPendingFirstCatch(newFirstCatch())).toBe(true);
    expect(hasPendingFirstCatch(endedFirstCatch())).toBe(false);
    expect(hasPendingFirstCatch({ pond: endedFirstCatch().pond, river: newFirstCatch().river })).toBe(true);
    expect(fixedFirstCatch(13)).toEqual({
      pond: { n: 0, legendAt: 13, epic: true, legend: true },
      river: { n: 0, legendAt: 13, epic: true, legend: true },
    });
  });
});

describe('firstCatchTarget', () => {
  it('마을 연못은 4번째까지 null, 5번째 금붕어, 정해진 번호(10~15)에서 황금 잉어를 고른다', () => {
    for (let n = 0; n < FIRST_CATCH_EPIC_AT - 1; n++) {
      expect(firstCatchTarget(spotAt('pond', n), 'pond', 'day', rngOf(0))).toBeNull();
    }
    expect(firstCatchTarget(spotAt('pond', 4), 'pond', 'day', rngOf(0))?.id).toBe('goldfish');
    expect(firstCatchTarget(spotAt('pond', 10, { epic: false }), 'pond', 'day', rngOf(0))).toBeNull();
    expect(firstCatchTarget(spotAt('pond', 11, { epic: false }), 'pond', 'day', rngOf(0))?.id).toBe('goldcarp');
  });

  it('마을 강은 4번째까지 null, 5번째 무지개 송어, 정해진 번호(10~15)에서 강의 주인을 고른다', () => {
    for (let n = 0; n < FIRST_CATCH_EPIC_AT - 1; n++) {
      expect(firstCatchTarget(spotAt('river', n), 'river', 'day', rngOf(0))).toBeNull();
    }
    expect(firstCatchTarget(spotAt('river', 4), 'river', 'day', rngOf(0))?.id).toBe('rainbow');
    expect(firstCatchTarget(spotAt('river', 10, { epic: false }), 'river', 'day', rngOf(0))).toBeNull();
    expect(firstCatchTarget(spotAt('river', 11, { epic: false }), 'river', 'day', rngOf(0))?.id).toBe('riverlord');
  });

  it('영웅과 전설이 동시에 기한에 닿으면 전설을 우선 고른다', () => {
    expect(firstCatchTarget(spotAt('pond', 11, { epic: true, legend: true }), 'pond', 'day', rngOf(0))?.id).toBe('goldcarp');
  });

  it('전설 번호가 아직 정해지지 않았으면 전설은 나오지 않는다', () => {
    expect(firstCatchTarget(spotAt('pond', 11, { legendAt: 0, epic: false }), 'pond', 'day', rngOf(0))).toBeNull();
  });

  it('끝난 보장은 대상이 없다', () => {
    expect(firstCatchTarget(endedFirstCatch(), 'pond', 'day', rngOf(0))).toBeNull();
    expect(firstCatchTarget(endedFirstCatch(), 'river', 'day', rngOf(0))).toBeNull();
  });

  it('바다 해역(sea 등)에는 보장을 적용하지 않는다', () => {
    expect(firstCatchTarget(spotAt('pond', 4), 'sea', 'day', rngOf(0))).toBeNull();
    expect(firstCatchTarget(spotAt('pond', 11, { epic: false }), 'sea', 'day', rngOf(0))).toBeNull();
    expect(firstCatchTarget(spotAt('pond', 4), 'barrierreef', 'day', rngOf(0))).toBeNull();
  });
});

describe('settleFirstCatch', () => {
  it('연못 캐치는 연못만 10~15 안에서 전설 번호를 정하고 카운트를 올리며 강은 건드리지 않는다', () => {
    const lo = settleFirstCatch(newFirstCatch(), 'pond', null, rngOf(0));
    const hi = settleFirstCatch(newFirstCatch(), 'pond', null, rngOf(0.999999));
    expect(lo.pond).toEqual({ n: 1, legendAt: 10, epic: true, legend: true });
    expect(hi.pond).toEqual({ n: 1, legendAt: 15, epic: true, legend: true });
    expect(lo.river).toEqual(newFirstCatch().river);
    expect(settleFirstCatch(lo, 'pond', null, rngOf(0.9)).pond.legendAt).toBe(10);
  });

  it('강 캐치는 강만 카운트를 올리고 연못은 건드리지 않는다', () => {
    const next = settleFirstCatch(newFirstCatch(), 'river', null, rngOf(0.5));
    expect(next.river).toEqual({ n: 1, legendAt: 13, epic: true, legend: true });
    expect(next.pond).toEqual(newFirstCatch().pond);
  });

  it('보장으로 잡은 등급의 몫만 해당 해역에서 닫고, 그 해역이 끝나도 다른 마을 해역은 유지된다', () => {
    const epic = FISH.find(f => f.id === 'goldfish')!;
    const legend = FISH.find(f => f.id === 'goldcarp')!;
    const a = settleFirstCatch(spotAt('pond', 4), 'pond', epic, rngOf(0));
    expect(a.pond).toEqual({ n: 5, legendAt: 12, epic: false, legend: true });
    expect(a.river).toEqual(newFirstCatch().river);
    const b = settleFirstCatch(a, 'pond', legend, rngOf(0));
    expect(b.pond).toEqual(endedFirstCatch().pond);
    expect(b.river).toEqual(newFirstCatch().river);
  });

  it('끝난 해역이나 바다 해역은 상태를 변경하지 않는다', () => {
    const init = newFirstCatch();
    expect(settleFirstCatch(endedFirstCatch(), 'pond', null, rngOf(0))).toEqual(endedFirstCatch());
    expect(settleFirstCatch(init, 'sea', null, rngOf(0))).toBe(init);
    expect(settleFirstCatch(init, 'barrierreef', null, rngOf(0))).toBe(init);
  });
});

describe('drawCatch 보장', () => {
  const base = { pity: {}, artifacts: [] as string[] };
  const phaseOpts = { phase: 'day' as const };
  const draw = (fc: FirstCatch, spot: 'pond' | 'river' | 'sea' = 'pond') =>
    drawCatch({ ...base, firstCatch: fc }, spot, 'auto', 10, 1, rngOf(0.1), phaseOpts, () => false);

  it('연못 5번째 캐치는 금붕어이고 연못 영웅 몫만 닫으며 강은 그대로다', () => {
    const d = draw(spotAt('pond', 4), 'pond');
    expect(d.fish.id).toBe('goldfish');
    expect(d.firstCatch.pond).toMatchObject({ n: 5, epic: false, legend: true });
    expect(d.firstCatch.river).toEqual(newFirstCatch().river);
    expect(d.byCeiling).toBe(false);
  });

  it('강 5번째 캐치는 무지개 송어이고 강 영웅 몫만 닫으며 연못은 그대로다', () => {
    const d = draw(spotAt('river', 4), 'river');
    expect(d.fish.id).toBe('rainbow');
    expect(d.firstCatch.river).toMatchObject({ n: 5, epic: false, legend: true });
    expect(d.firstCatch.pond).toEqual(newFirstCatch().pond);
  });

  it('바다 해역 캐치는 첫 경험 보장 상태를 건드리지 않는다', () => {
    const init = newFirstCatch();
    const d = draw(init, 'sea');
    expect(d.firstCatch).toEqual(init);
  });
});
