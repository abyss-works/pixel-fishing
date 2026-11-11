import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../../src/game/content/spots';
import { RARITY_ORDER } from '../../../src/game/content/rarity';
import { entryLevel, rng } from '../model';
import { NO_EFFECT, dexTimes, effectRates } from './effects';
import type { Effect } from './effects';
import { axisOf } from './progress';
import { BAIT_EFFECTS, BAIT_WINDOW_MIN, baitEffect, windowRows } from './cooking';

const fx = (e: Partial<Effect>): Effect => ({ ...NO_EFFECT, ...e });
const last = SPOTS[SPOTS.length - 1].id;

describe('구매 미끼 효과', () => {
  it('희귀 이상 +20%, 영웅 이상 +40%, 전설 +60%이고 창은 30분이다', () => {
    expect(BAIT_EFFECTS).toEqual({ rare: fx({ rare: 0.2 }), epic: fx({ epic: 0.4 }), legendary: fx({ legendary: 0.6 }) });
    expect(BAIT_WINDOW_MIN).toBe(30);
    expect(baitEffect('epic')).toEqual(fx({ epic: 0.4 }));
  });

  it('모르는 미끼 이름은 오류다', () => {
    expect(() => baitEffect('common')).toThrow(/미끼/);
  });
});

describe('도감 완성의 앞 구간 효과', () => {
  const rows = effectRates(last, entryLevel(last), 'good', NO_EFFECT);
  const boosted = effectRates(last, entryLevel(last), 'good', fx({ legendary: 0.6, epic: 0.4 }));

  it('구간이 0분이면 구간이 없는 것과 같다', () => {
    const plain = dexTimes(rows.rows, rows.variantShare, rows.catchesPerHour, 20, rng(3));
    const zero = dexTimes(rows.rows, rows.variantShare, rows.catchesPerHour, 20, rng(3), {
      minutes: 0, rows: boosted.rows, share: boosted.variantShare, catchesPerHour: boosted.catchesPerHour,
    });
    expect(zero).toEqual(plain);
  });

  it('구간이 끝날 때까지 이어지면 그 효과만으로 낚은 것과 같다', () => {
    const win = { minutes: 1e6, rows: boosted.rows, share: boosted.variantShare, catchesPerHour: 60 };
    const full = dexTimes(rows.rows, rows.variantShare, rows.catchesPerHour, 20, rng(4), win);
    const only = dexTimes(boosted.rows, boosted.variantShare, 60, 20, rng(4));
    expect(full).toEqual(only);
  });

  it('등급 가중 구간은 그 등급 도감 완성 시간을 줄인다', () => {
    const win = { minutes: 30, rows: boosted.rows, share: boosted.variantShare, catchesPerHour: boosted.catchesPerHour };
    const base = dexTimes(rows.rows, rows.variantShare, rows.catchesPerHour, 200, rng(5));
    const withWin = dexTimes(rows.rows, rows.variantShare, rows.catchesPerHour, 200, rng(5), win);
    expect(withWin.legendary!.mean!).toBeLessThan(base.legendary!.mean!);
    expect(withWin.epic!.mean!).toBeLessThan(base.epic!.mean!);
  });

  it('같은 시드는 같은 결과다', () => {
    const win = { minutes: 30, rows: boosted.rows, share: boosted.variantShare, catchesPerHour: boosted.catchesPerHour };
    const a = dexTimes(rows.rows, rows.variantShare, rows.catchesPerHour, 10, rng(6), win);
    expect(a).toEqual(dexTimes(rows.rows, rows.variantShare, rows.catchesPerHour, 10, rng(6), win));
  });
});

describe('시간 제한 효과 창', () => {
  const opts = { axis: 'manual' as const, effect: BAIT_EFFECTS.epic, margin: 0, minutes: 30, trials: 20, seed: 7 };

  it('창 안의 등급별 기대 캐치 수는 캐치 속도 × 창 길이 × 등급 비율이다', () => {
    for (const r of windowRows(opts)) {
      const axis = axisOf('manual', r.spot, r.level);
      const base = effectRates(r.spot, r.level, axis, NO_EFFECT), now = effectRates(r.spot, r.level, axis, opts.effect);
      for (const g of RARITY_ORDER) {
        expect(r.catches[g].base).toBeCloseTo((base.rarity[g] ?? 0) * base.catchesPerHour / 2, 9);
        expect(r.catches[g].with).toBeCloseTo((now.rarity[g] ?? 0) * now.catchesPerHour / 2, 9);
      }
      expect(r.totalBase).toBeCloseTo(base.catchesPerHour / 2, 9);
    }
  });

  it('창 안의 골드와 명성 증가는 시간당 차이 × 창 길이다', () => {
    for (const r of windowRows({ ...opts, minutes: 45 })) {
      const axis = axisOf('manual', r.spot, r.level);
      const base = effectRates(r.spot, r.level, axis, NO_EFFECT), now = effectRates(r.spot, r.level, axis, opts.effect);
      expect(r.goldGain).toBeCloseTo((now.goldPerHour - base.goldPerHour) * 0.75, 6);
      expect(r.fameGain).toBeCloseTo((now.famePerHour - base.famePerHour) * 0.75, 6);
    }
  });

  it('효과 없음이면 증가와 도감 단축이 0에 가깝고 캐치 수가 같다', () => {
    for (const r of windowRows({ ...opts, effect: NO_EFFECT })) {
      expect(r.goldGain).toBeCloseTo(0, 9);
      for (const g of RARITY_ORDER) expect(r.catches[g].with).toBeCloseTo(r.catches[g].base, 12);
    }
  });

  it('도감 단축은 효과 없이 낚는 도감 완성 시간에서 창 하나를 쓴 시간을 뺀 값이고 시드가 같으면 같다', () => {
    const a = windowRows(opts), b = windowRows(opts);
    expect(a).toEqual(b);
    for (const r of a) for (const k of ['epic', 'legendary'] as const) {
      const base = r.dex.base[k], w = r.dex.with[k];
      if (base?.mean != null && w?.mean != null) expect(r.saved[k]).toBeCloseTo(base.mean - w.mean, 12);
      else expect(r.saved[k]).toBeNull();
    }
  });

  it('창 길이와 시도 횟수가 잘못되면 오류다', () => {
    expect(() => windowRows({ ...opts, minutes: 0 })).toThrow(/분/);
    expect(() => windowRows({ ...opts, minutes: -5 })).toThrow(/분/);
    expect(() => windowRows({ ...opts, trials: 0 })).toThrow(/시도/);
  });

  it('음수 여유는 레벨 1 미만 해역을 건너뛴다', () => {
    const ids = windowRows({ ...opts, margin: -4 }).map(r => r.spot);
    expect(ids).not.toContain('pond');
    expect(ids).toContain(last);
  });
});
