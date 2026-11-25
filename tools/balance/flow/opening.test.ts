import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../../src/game/content/spots';
import { FIRST_CATCH_SPOT_CAPS, newFirstCatch } from '../../../src/game/rules/firstCatch';
import { entryLevel, rng } from '../model';
import { applyOverride } from './override';
import { createSampler } from './sample';
import { OPENING_TARGET_SEC, simulateOpening } from './opening';
import type { Judgment } from './opening';

const run = (firstCatch: boolean, judgment: Judgment = 'normal') => simulateOpening({ judgment, firstCatch });
const sea = SPOTS.find(s => s.boatTier >= 1)!;

describe('최초 10분', () => {
  it('목표 시간은 10분이고 해역별 첫 경험 보장 상한과 초기 상태를 따른다', () => {
    expect(OPENING_TARGET_SEC).toBe(600);
    expect(FIRST_CATCH_SPOT_CAPS).toEqual({ pond: 20, river: 30 });
    expect(newFirstCatch()).toEqual({
      pond: { n: 0, active: true },
      river: { n: 0, active: true },
    });
  });

  it('수동 낚시로 첫 바다 해역에 도착하고 강화와 배 구매를 거친다', () => {
    const r = run(false);
    expect(r.arrival).not.toBeNull();
    expect(r.steps.filter(s => s.kind === 'upgrade')).toHaveLength(entryLevel(sea.id) - 1);
    expect(r.steps.filter(s => s.kind === 'boat')).toHaveLength(1);
    expect(r.steps.at(-1)!.kind).toBe('arrive');
    const times = r.steps.map(s => s.seconds);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('보장이 없으면 보장 단계가 없다', () => {
    expect(run(false).steps.some(s => s.kind === 'guarantee')).toBe(false);
  });

  it('해역별 상한(연못 20, 강 30) 안에서 미보유 일반 폼 어종을 보장한다', () => {
    const r = run(true);
    const pondGuarantees = r.steps.filter(s => s.kind === 'guarantee');
    expect(pondGuarantees.length).toBeGreaterThan(0);

    // 배 가격을 높여 연못과 강에 오래 머무르게 하면 각 해역 상한 안에서만 보장이 발동한다
    const restore = applyOverride({ boats: { '1': { price: 3000 } } });
    try {
      const slow = simulateOpening({ judgment: 'normal', firstCatch: true, sampler: createSampler(rng(1)) });
      const move = slow.steps.find(s => s.kind === 'move' && s.detail === 'river')!;
      const guarantees = slow.steps.filter(s => s.kind === 'guarantee');
      for (const g of guarantees) {
        if (g.catches <= move.catches) {
          expect(g.catches).toBeLessThanOrEqual(FIRST_CATCH_SPOT_CAPS.pond!);
        } else {
          expect(g.catches - move.catches).toBeLessThanOrEqual(FIRST_CATCH_SPOT_CAPS.river!);
        }
      }
    } finally {
      restore();
    }
  });

  it('GOOD는 무판정보다 빠르게 도착한다', () => {
    expect(run(false, 'good').arrival!.seconds).toBeLessThan(run(false).arrival!.seconds);
    expect(run(true, 'good').arrival!.seconds).toBeLessThan(run(true).arrival!.seconds);
  });

  it('기본 상수에서는 보장이 있든 없든 10분 안에 도착한다', () => {
    for (const fc of [false, true]) expect(run(fc).arrival!.seconds).toBeLessThanOrEqual(OPENING_TARGET_SEC);
    for (let seed = 1; seed <= 20; seed++) {
      const r = simulateOpening({ judgment: 'normal', firstCatch: true, sampler: createSampler(rng(seed)) });
      expect(r.arrival).not.toBeNull();
      expect(r.arrival!.seconds).toBeLessThanOrEqual(OPENING_TARGET_SEC);
    }
  });

  it('호환 인자 legendAt은 null이면 보장 없음, 그 외에는 상한 보장으로 동작한다', () => {
    expect(simulateOpening({ judgment: 'normal', legendAt: null }).steps).toEqual(run(false).steps);
    expect(simulateOpening({ judgment: 'normal', legendAt: 15 }).steps).toEqual(run(true).steps);
  });

  it('같은 입력은 같은 결과다', () => {
    expect(run(true)).toEqual(run(true));
  });

  it('배 가격 덮어쓰기는 도착을 늦춘다', () => {
    const base = run(true).arrival!.seconds;
    const restore = applyOverride({ boats: { '1': { price: 3000 } } });
    try { expect(run(true).arrival!.seconds).toBeGreaterThan(base); } finally { restore(); }
  });
});
