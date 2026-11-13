import { describe, expect, it } from 'vitest';
import { BOUNTIES } from '../../src/game/content/bounties';
import { FISH } from '../../src/game/content/fish';
import { RARITY_ORDER } from '../../src/game/content/rarity';
import { BIG_CATCH_PERCENTILE } from '../../src/game/rules/balance';
import { NAMED_PITY_CATCHES } from '../../src/game/rules/pity';
import { ZONE_ORDER, rng, spotsOfZone } from './model';
import { catchTimes, namedTimes, selfTimes, stat, zoneRun } from './selfTimes';

const N = 4;

describe('통계', () => {
  it('평균과 p90을 낸다', () => {
    const s = stat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(s.mean).toBe(5.5);
    expect(s.p90).toBe(10);
  });

  it('값이 하나면 그 값이다', () => {
    expect(stat([3])).toEqual({ mean: 3, p90: 3 });
  });

  it('빈 값은 거부한다', () => {
    expect(() => stat([])).toThrow();
  });
});

describe('구역 수집 한 번', () => {
  const zone = ZONE_ORDER[1];
  const run = (seed: number, big: number[] = [1, 3]) => zoneRun({ zone, play: 'idle', rand: rng(seed), big });

  it('같은 시드는 같은 시각을 낸다', () => {
    expect(run(1)).toEqual(run(1));
  });

  it('등급마다, 밤 일반과 변이마다 시각이 있고 없는 대상은 null이다', () => {
    const r = run(2);
    for (const g of RARITY_ORDER) {
      const has = FISH.some(f => spotsOfZone(zone).some(s => s.id === f.spot) && f.rarity === g);
      expect(r.grade[g] === null, g).toBe(!has);
    }
    const nights = FISH.filter(f => spotsOfZone(zone).some(s => s.id === f.spot) && f.night);
    expect(r.night.normal === null).toBe(nights.length === 0);
    expect(r.night.variant === null).toBe(nights.length === 0);
  });

  it('일반 폼 전부 모으는 시각은 같은 구역의 등급 시각보다 이르지 않다', () => {
    const r = run(3);
    const times = RARITY_ORDER.map(g => r.grade[g]).filter((x): x is number => x !== null);
    expect(r.all).toBeGreaterThanOrEqual(Math.max(...times));
  });

  it('월척 어종 수 단계는 늘어날수록 늦고 구역 어종 수를 넘는 단계는 null이다', () => {
    const species = FISH.filter(f => spotsOfZone(zone).some(s => s.id === f.spot)).length;
    const r = zoneRun({ zone, play: 'idle', rand: rng(4), big: [1, 2, species + 1] });
    expect(r.big[0]).toBeLessThanOrEqual(r.big[1]!);
    expect(r.big[2]).toBeNull();
    expect(r.bigAll).toBeGreaterThanOrEqual(r.big[1]!);
  });

  it('수동은 같은 시드에서 방치와 시각이 다르다', () => {
    expect(zoneRun({ zone, play: 'manual', rand: rng(2), big: [] })).not.toEqual(run(2, []));
  });
});

describe('네임드 전부', () => {
  const quests = BOUNTIES.filter(q => q.difficulty === 'named');

  it('같은 시드는 같은 시간이고 양수다', () => {
    const a = namedTimes('idle', rng(1)), b = namedTimes('idle', rng(1));
    expect(a).toEqual(b);
    expect(a.hours).toBeGreaterThan(0);
  });

  it('네임드마다 시간이 있고 천장 캐치 수를 넘지 않는다', () => {
    const t = namedTimes('idle', rng(5));
    expect(t.each).toHaveLength(quests.length);
    for (const e of t.each) { expect(e.catches).toBeGreaterThanOrEqual(1); expect(e.catches).toBeLessThanOrEqual(NAMED_PITY_CATCHES); }
    expect(t.hours).toBeCloseTo(t.each.reduce((s, e) => s + e.hours, 0), 9);
  });
});

describe('낚은 수 단계', () => {
  it('단계가 클수록 늦고 단계마다 하나씩 낸다', () => {
    const t = catchTimes('idle', [100, 1_000, 10_000]);
    expect(t.map(x => x.n)).toEqual([100, 1_000, 10_000]);
    expect(t[0].hours).toBeGreaterThan(0);
    expect(t[0].hours).toBeLessThan(t[1].hours);
    expect(t[1].hours).toBeLessThan(t[2].hours);
  });

  it('진행 경로 끝을 넘는 단계는 마지막 해역의 캐치 속도로 이어 센다', () => {
    const t = catchTimes('idle', [10_000, 1_000_000]);
    expect(t[1].hours).toBeGreaterThan(t[0].hours);
    expect(t[1].hours - t[0].hours).toBeGreaterThan(900);
  });

  it('수동은 방치와 다른 속도다', () => {
    expect(catchTimes('manual', [1_000])[0].hours).not.toBe(catchTimes('idle', [1_000])[0].hours);
  });
});

describe('자기만족 업적 달성 시간', () => {
  const d = selfTimes({ runs: N, seed: 3, big: [2], catchSteps: [100, 1_000] });

  it('방치와 수동 순서로 낸다', () => {
    expect(d.map(x => x.play)).toEqual(['idle', 'manual']);
  });

  it('등급마다, 밤 일반과 변이마다, 네임드, 월척 단계, 낚은 수 단계의 평균과 p90을 낸다', () => {
    for (const x of d) {
      expect(Object.keys(x.grades)).toEqual([...RARITY_ORDER]);
      for (const g of RARITY_ORDER) expect(x.grades[g].p90).toBeGreaterThanOrEqual(x.grades[g].mean * 0.5);
      expect(x.night.variant.mean).toBeGreaterThan(x.night.normal.mean);
      expect(x.named.mean).toBeGreaterThan(0);
      expect(x.big.map(b => b.n)).toEqual([2]);
      expect(x.bigAll.mean).toBeGreaterThan(0);
      expect(x.catches.map(c => c.n)).toEqual([100, 1_000]);
    }
  });

  it('월척 단계는 구역별 행을 담고 구역 순서는 구역 목록과 같다', () => {
    for (const x of d) {
      expect(x.big[0].zones.map(z => z.zone)).toEqual(ZONE_ORDER);
    }
  });

  it('같은 인자는 같은 결과를 낸다', () => {
    expect(selfTimes({ runs: N, seed: 3, big: [2], catchSteps: [100, 1_000] })).toEqual(d);
  });

  it('월척 단계와 낚은 수 단계를 비우면 그 행이 비어 있다', () => {
    const e = selfTimes({ runs: 2, seed: 1, big: [], catchSteps: [] });
    for (const x of e) { expect(x.big).toEqual([]); expect(x.catches).toEqual([]); }
  });

  it('시도 횟수가 1 미만이면 거부한다', () => {
    expect(() => selfTimes({ runs: 0, seed: 1, big: [], catchSteps: [] })).toThrow();
  });

  it('월척 기준 비율은 제품 상수를 따른다', () => {
    expect(BIG_CATCH_PERCENTILE).toBeGreaterThan(0);
  });
});
