import { describe, expect, it } from 'vitest';
import { BOUNTY_ZONES } from '../../../src/game/content/bounties';
import { SPOTS } from '../../../src/game/content/spots';
import { spotsOfZone, zoneOf } from '../model';
import { rewardDist, spotRewardDist } from './dist';

const opts = { trials: 20, seed: 5, axis: 'idle', maxDays: 365, hours: 4, basicShare: 0.5 } as const;

function nextRegionSpot(zone: (typeof BOUNTY_ZONES)[number]): string | null {
  const last = spotsOfZone(zone).at(-1)!;
  const idx = SPOTS.findIndex(s => s.id === last.id);
  const next = SPOTS[idx + 1];
  return next && zoneOf(next.id) !== zone ? next.id : null;
}

describe('업적 지급 시점 분포', () => {
  const d = rewardDist(opts);

  it('구역과 업적 종류마다 한 행이다', () => {
    expect(d).toHaveLength(BOUNTY_ZONES.length * 2);
    expect(d.map(r => `${r.zone}:${r.tier}`)).toEqual(BOUNTY_ZONES.flatMap(z => [`${z}:basic`, `${z}:named`]));
  });

  it('마지막 구역을 포함한 모든 구역이 골드 보상을 가진다', () => {
    for (const r of d) {
      expect(r.reward.gold).toBeGreaterThan(0);
      expect('fame' in r.reward).toBe(false);
    }
  });

  it('달성한 시도와 못 한 시도의 합이 시도 횟수다', () => {
    for (const r of d) expect((r.achieved?.n ?? 0) + (r.achieved?.missing ?? opts.trials)).toBe(opts.trials);
  });

  it('다음 지역이 있는 구역은 다음 지역 첫 해역 도착 분포를 담고 없는 구역은 null이다', () => {
    for (const r of d) {
      const to = nextRegionSpot(r.zone);
      if (to === null) { expect(r.arrival).toBeNull(); expect(r.arrivalWithReward).toBeNull(); expect(r.to).toBeNull(); }
      else {
        expect(r.to).toBe(to);
        expect(SPOTS.some(s => s.id === r.to)).toBe(true);
        expect(r.arrival).not.toBeNull();
      }
    }
  });

  it('달성 분포는 p10, 중앙값, p90 순이다', () => {
    for (const r of d) if (r.achieved) {
      expect(r.achieved.p10).toBeLessThanOrEqual(r.achieved.p50);
      expect(r.achieved.p50).toBeLessThanOrEqual(r.achieved.p90);
    }
  });

  it('같은 인자는 같은 결과를 낸다', () => {
    expect(rewardDist(opts)).toEqual(d);
  });

  it('시드가 다르면 결과가 달라진다', () => {
    expect(rewardDist({ ...opts, seed: 6 })).not.toEqual(d);
  });

  it('시도 횟수가 1 미만이면 거부한다', () => {
    expect(() => rewardDist({ ...opts, trials: 0 })).toThrow();
  });

  it('보상 없는 도착은 보상을 넣은 도착과 같은 시도에서 짝지어 쓴다 — 보상 지급 전 구간은 같다', () => {
    const few = rewardDist({ ...opts, trials: 2, seed: 1 });
    const r = few.find(x => x.zone === 'pacific' && x.tier === 'basic')!;
    expect(r.achieved).toBeNull();
    expect(r.arrivalWithReward).toEqual(r.arrival);
  });
});

describe('해역 단위(spot) 26종 업적 분포', () => {
  const d = spotRewardDist(opts);

  it('전체 13개 해역 × 기초·숙련 = 26종 행을 순서대로 낸다', () => {
    expect(d).toHaveLength(SPOTS.length * 2);
    expect(d.map(r => `${r.spot}:${r.tier}`)).toEqual(SPOTS.flatMap(s => [`${s.id}:basic`, `${s.id}:named`]));
    for (const r of d) {
      expect(r.tierName).toBe(r.tier === 'basic' ? '기초' : '숙련');
      expect(r.reward.gold).toBeGreaterThan(0);
    }
  });

  it('달성률은 0~1이고 달성 분포는 p10 <= 중앙값 <= p90 순이다', () => {
    for (const r of d) {
      expect(r.achievedRate).toBeGreaterThanOrEqual(0);
      expect(r.achievedRate).toBeLessThanOrEqual(1);
      if (r.achieved) {
        expect(r.achievedRate).toBeCloseTo(r.achieved.n / opts.trials, 12);
        expect(r.achieved.n + r.achieved.missing).toBe(opts.trials);
        expect(r.achieved.p10).toBeLessThanOrEqual(r.achieved.p50);
        expect(r.achieved.p50).toBeLessThanOrEqual(r.achieved.p90);
      } else {
        expect(r.achievedRate).toBe(0);
      }
    }
  });

  it('보상 지급 진행과 보상 없음 진행을 짝지어 도착 단축을 낸다', () => {
    const mid = d.find(r => r.spot === 'indian' && r.tier === 'basic')!;
    expect(mid.to).toBe('southindian');
    expect(mid.shortened).not.toBeNull();
    expect(d.find(r => r.spot === 'sthelena')!.to).toBeNull();
  });

  it('같은 시드와 인자는 같은 결과를 내고 시드가 다르면 달라진다', () => {
    expect(spotRewardDist(opts)).toEqual(d);
    expect(spotRewardDist({ ...opts, seed: 6 })).not.toEqual(d);
  });
});
