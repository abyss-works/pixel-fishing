import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../../src/game/content/spots';
import { FIRST_CATCH_EPIC_AT, FIRST_CATCH_LEGEND_MAX, FIRST_CATCH_LEGEND_MIN } from '../../../src/game/rules/firstCatch';
import { entryLevel } from '../model';
import { applyOverride } from './override';
import { OPENING_TARGET_SEC, simulateOpening } from './opening';
import type { Judgment } from './opening';

const run = (legendAt: number | null, judgment: Judgment = 'normal') => simulateOpening({ judgment, legendAt });
const sea = SPOTS.find(s => s.boatTier >= 1)!;

describe('최초 10분', () => {
  it('목표 시간은 10분이다', () => {
    expect(OPENING_TARGET_SEC).toBe(600);
  });

  it('수동 낚시로 첫 바다 해역에 도착하고 강화와 배 구매를 거친다', () => {
    const r = run(null);
    expect(r.arrival).not.toBeNull();
    expect(r.steps.filter(s => s.kind === 'upgrade')).toHaveLength(entryLevel(sea.id) - 1);
    expect(r.steps.filter(s => s.kind === 'boat')).toHaveLength(1);
    expect(r.steps.at(-1)!.kind).toBe('arrive');
    const times = r.steps.map(s => s.seconds);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('보장이 없으면 영웅과 전설 단계가 없다', () => {
    expect(run(null).steps.some(s => s.kind === 'guarantee')).toBe(false);
  });

  it('영웅은 5번째 캐치, 전설은 정한 번호 이후에 받는다', () => {
    const r = run(15);
    const g = r.steps.filter(s => s.kind === 'guarantee');
    expect(g.map(s => s.detail)).toEqual(['epic', 'legendary']);
    expect(g[0].catches).toBe(FIRST_CATCH_EPIC_AT);
    expect(g[1].catches).toBeGreaterThanOrEqual(15);
  });

  it('보장은 도착을 앞당기고 전설 번호가 이를수록 더 빠르다', () => {
    const none = run(null).arrival!.seconds;
    const l10 = run(10).arrival!.seconds, l15 = run(15).arrival!.seconds, l20 = run(20).arrival!.seconds;
    expect(l10).toBeLessThanOrEqual(l15);
    expect(l15).toBeLessThanOrEqual(l20);
    expect(l20).toBeLessThan(none);
  });

  it('GOOD는 무판정보다 늦지 않다', () => {
    for (const at of [null, 10, 15, 20]) {
      expect(run(at, 'good').arrival!.seconds, `${at}`).toBeLessThanOrEqual(run(at).arrival!.seconds);
    }
  });

  it('기본 상수에서는 보장이 있든 없든 10분 안에 도착한다', () => {
    for (const at of [null, 10, 15, 20]) expect(run(at).arrival!.seconds).toBeLessThanOrEqual(OPENING_TARGET_SEC);
  });

  it('전설 번호는 제품의 범위 안이어야 한다', () => {
    expect(() => run(FIRST_CATCH_LEGEND_MIN - 1)).toThrow(/전설/);
    expect(() => run(FIRST_CATCH_LEGEND_MAX + 1)).toThrow(/전설/);
    expect(() => run(Number.NaN)).toThrow(/전설/);
  });

  it('같은 입력은 같은 결과다', () => {
    expect(run(15)).toEqual(run(15));
  });

  it('배 가격 덮어쓰기는 도착을 늦춘다', () => {
    const base = run(15).arrival!.seconds;
    const restore = applyOverride({ boats: { '1': { price: 3000 } } });
    try { expect(run(15).arrival!.seconds).toBeGreaterThan(base); } finally { restore(); }
  });
});
