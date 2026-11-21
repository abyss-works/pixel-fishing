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

  it('마을 해역마다 5번째 캐치에서 영웅을 받고, 전설 번호까지 머무르면 전설을 받는다', () => {
    const r = run(15);
    const g = r.steps.filter(s => s.kind === 'guarantee');
    expect(g[0]).toMatchObject({ detail: 'epic', catches: FIRST_CATCH_EPIC_AT });
    expect(g.every(s => s.detail === 'epic' || s.detail === 'legendary')).toBe(true);

    // 배 가격을 높여 마을 강에 오래 머무르게 하면 마을 강 전설 보장도 정한 번호에 발동한다
    const restore = applyOverride({ boats: { '1': { price: 3000 } } });
    try {
      const slow = run(15);
      const move = slow.steps.find(s => s.kind === 'move' && s.detail === 'river')!;
      const legend = slow.steps.find(s => s.kind === 'guarantee' && s.detail === 'legendary')!;
      expect(legend.catches - move.catches).toBe(15);
    } finally {
      restore();
    }
  });

  it('보장은 도착을 앞당기고 전설 번호가 이를수록 늦지 않다', () => {
    const none = run(null).arrival!.seconds;
    const l10 = run(10).arrival!.seconds, l13 = run(13).arrival!.seconds, l15 = run(15).arrival!.seconds;
    expect(l10).toBeLessThanOrEqual(l13);
    expect(l13).toBeLessThanOrEqual(l15);
    expect(l15).toBeLessThan(none);
  });

  it('GOOD는 보장 없을 때 무판정보다 빠르고, 보장이 있어도 같은 캐치 수 이하로 도착한다', () => {
    expect(run(null, 'good').arrival!.seconds).toBeLessThan(run(null).arrival!.seconds);
    for (const at of [10, 13, 15]) {
      expect(run(at, 'good').arrival!.catches, `${at}`).toBeLessThanOrEqual(run(at).arrival!.catches);
    }
  });

  it('기본 상수에서는 보장이 있든 없든 10분 안에 도착한다', () => {
    for (const at of [null, 10, 13, 15]) expect(run(at).arrival!.seconds).toBeLessThanOrEqual(OPENING_TARGET_SEC);
  });

  it('전설 번호는 제품의 범위(10~15) 안이어야 한다', () => {
    expect(FIRST_CATCH_LEGEND_MAX).toBe(15);
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
