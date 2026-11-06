// 새 계정 첫 경험 보장 — 5번째 캐치에서 영웅, 정해진 10~20번째 캐치에서 전설.
import { describe, it, expect } from 'vitest';
import { FIRST_CATCH_EPIC_AT, endedFirstCatch, firstCatchTarget, newFirstCatch, settleFirstCatch } from './firstCatch';
import type { FirstCatch } from './firstCatch';
import { drawCatch } from './actions';
import { FISH } from '../content/fish';
import { SPOTS } from '../content/spots';

const rngOf = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };
const at = (n: number, over: Partial<FirstCatch> = {}): FirstCatch => ({ ...newFirstCatch(), n, legendAt: 12, ...over });

describe('firstCatchTarget', () => {
  it('4번째까지는 보장이 없고 5번째 캐치에서 그 수역의 영웅 어종을 고른다', () => {
    for (let n = 0; n < FIRST_CATCH_EPIC_AT - 1; n++) expect(firstCatchTarget(at(n), 'pond', 'day', rngOf(0))).toBeNull();
    expect(firstCatchTarget(at(4), 'pond', 'day', rngOf(0))?.rarity).toBe('epic');
    expect(firstCatchTarget(at(4), 'pond', 'day', rngOf(0))?.spot).toBe('pond');
  });
  it('정해진 번호의 캐치에서 그 수역의 전설 어종을 고른다', () => {
    expect(firstCatchTarget(at(11, { epic: false }), 'river', 'day', rngOf(0))?.rarity).toBe('legendary');
    expect(firstCatchTarget(at(10, { epic: false }), 'river', 'day', rngOf(0))).toBeNull();
  });
  it('전설 번호가 아직 정해지지 않았으면 전설은 나오지 않는다', () => {
    expect(firstCatchTarget(at(11, { legendAt: 0, epic: false }), 'pond', 'day', rngOf(0))).toBeNull();
  });
  it('끝난 보장은 대상이 없다', () => {
    expect(firstCatchTarget(endedFirstCatch(), 'pond', 'day', rngOf(0))).toBeNull();
  });
  it('해당 등급 어종이 없는 수역이면 미루고, 다음 캐치에서 어종이 있는 수역에서 이어진다', () => {
    expect(FISH.some(f => f.spot === 'barrierreef' && f.rarity === 'epic')).toBe(false);
    expect(firstCatchTarget(at(4), 'barrierreef', 'day', rngOf(0))).toBeNull();
    expect(firstCatchTarget(at(5), 'pond', 'day', rngOf(0))?.rarity).toBe('epic');
  });
  it('모든 수역에 영웅 또는 전설 어종이 하나 이상 있다', () => {
    for (const s of SPOTS) expect(FISH.some(f => f.spot === s.id && (f.rarity === 'epic' || f.rarity === 'legendary'))).toBe(true);
  });
  it('낮에는 밤 전용 어종을 고르지 않는다', () => {
    for (const r of [0, 0.5, 0.99]) {
      expect(firstCatchTarget(at(11, { epic: false }), 'sea', 'day', rngOf(r))?.night).toBeFalsy();
    }
  });
});

describe('settleFirstCatch', () => {
  it('캐치마다 수를 올리고 첫 캐치에서 전설 번호를 10~20 안에서 정한다', () => {
    const lo = settleFirstCatch(newFirstCatch(), null, rngOf(0));
    const hi = settleFirstCatch(newFirstCatch(), null, rngOf(0.999999));
    expect(lo).toMatchObject({ n: 1, legendAt: 10 });
    expect(hi).toMatchObject({ n: 1, legendAt: 20 });
    expect(settleFirstCatch(lo, null, rngOf(0.9)).legendAt).toBe(10);
  });
  it('보장으로 잡은 등급의 몫만 닫고, 둘 다 닫히면 끝난다', () => {
    const epic = FISH.find(f => f.rarity === 'epic')!;
    const legend = FISH.find(f => f.rarity === 'legendary')!;
    const a = settleFirstCatch(at(4), epic, rngOf(0));
    expect(a).toMatchObject({ epic: false, legend: true });
    expect(settleFirstCatch(a, legend, rngOf(0))).toEqual(endedFirstCatch());
  });
  it('끝난 보장은 변하지 않는다', () => {
    expect(settleFirstCatch(endedFirstCatch(), null, rngOf(0))).toEqual(endedFirstCatch());
  });
});

describe('drawCatch 보장', () => {
  const base = { pity: {}, artifacts: [] as string[] };
  const phaseOpts = { phase: 'day' as const };
  const draw = (fc: FirstCatch, spot: 'pond' | 'barrierreef' = 'pond') =>
    drawCatch({ ...base, firstCatch: fc }, spot, 'auto', 10, 10, 1, rngOf(0.1), phaseOpts, () => false);

  it('5번째 캐치는 영웅 어종, 결과의 보장 상태는 영웅 몫을 닫는다', () => {
    const d = draw(at(4));
    expect(d.fish.rarity).toBe('epic');
    expect(d.firstCatch).toMatchObject({ n: 5, epic: false, legend: true });
    expect(d.byCeiling).toBe(false);
  });
  it('보장 캐치의 크기와 폼은 일반 롤을 따른다 — 영웅이 아닌 캐치는 통상 추첨', () => {
    const d = draw(at(0));
    expect(d.firstCatch.n).toBe(1);
    expect(d.firstCatch.legendAt).toBeGreaterThanOrEqual(10);
  });
  it('영웅 어종이 없는 수역에서는 미루고 카운트만 올린다', () => {
    const d = draw(at(4), 'barrierreef');
    expect(d.firstCatch).toMatchObject({ n: 5, epic: true });
  });
});
