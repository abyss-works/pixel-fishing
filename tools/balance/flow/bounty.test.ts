import { describe, expect, it } from 'vitest';
import { FISH } from '../../../src/game/content/fish';
import { BOUNTIES } from '../../../src/game/content/bounties';
import { LICENSE_GRADES } from '../../../src/game/rules/logic';
import { NAMED_PITY_CATCHES } from '../../../src/game/rules/pity';
import { rates, zoneOf } from '../model';
import type { Axis } from '../model';
import type { SpotId } from '../../../src/game/content/spots';
import {
  accessibleSpots, dexCompletion, expectedEncounterCatches, licenseHeld, planBounties,
} from './bounty';
import type { DexLog, PlanInput } from './bounty';

const zoneFish = (zone: string) => FISH.filter(f => zoneOf(f.spot) === zone);
const logOf = (fish: { id: string }[], v: number): DexLog => new Map(fish.map(f => [f.id, v]));

describe('도감 라이선스', () => {
  it('기록이 없으면 완성 확률 0이고 라이선스가 없다', () => {
    expect(dexCompletion(new Map(), 'pacific', 'basic')).toBe(0);
    expect(licenseHeld(new Map(), 'pacific', 'basic')).toBe(false);
  });

  it('구역 어종을 모두 확실히 잡았으면 완성이다', () => {
    const dex = logOf(zoneFish('pacific'), -50);
    expect(dexCompletion(dex, 'pacific', 'basic')).toBeCloseTo(1, 6);
    expect(licenseHeld(dex, 'pacific', 'named')).toBe(true);
  });

  it('한 종이라도 기록이 없으면 라이선스가 없다', () => {
    const fish = zoneFish('pacific').filter(f => LICENSE_GRADES.basic.includes(f.rarity));
    const dex = logOf(fish.slice(1), -50);
    expect(licenseHeld(dex, 'pacific', 'basic')).toBe(false);
  });

  it('네임드 라이선스는 전설까지, 기본은 전설을 뺀다', () => {
    const rest = zoneFish('pacific').filter(f => f.rarity !== 'legendary');
    const dex = logOf(rest, -50);
    expect(licenseHeld(dex, 'pacific', 'basic')).toBe(true);
    expect(licenseHeld(dex, 'pacific', 'named')).toBe(false);
  });

  it('완성 확률이 0.5 이하이면 라이선스를 쓰지 못한다', () => {
    const dex = logOf(zoneFish('pacific'), Math.log(0.5));
    expect(licenseHeld(dex, 'pacific', 'basic')).toBe(false);
  });
});

describe('네임드 조우 기대 캐치 수', () => {
  it('천장이 없으면 1/p, 천장 1이면 1이다', () => {
    expect(expectedEncounterCatches(0.5, 1000)).toBeCloseTo(2, 6);
    expect(expectedEncounterCatches(0.001, 1)).toBeCloseTo(1, 6);
  });

  it('기본 확률 1/1000과 제품 천장에서 약 800이다', () => {
    const v = expectedEncounterCatches(0.001, NAMED_PITY_CATCHES);
    expect(v).toBeGreaterThan(790);
    expect(v).toBeLessThan(810);
  });
});

describe('낚을 수 있는 구역 해역', () => {
  it('배와 파워가 모두 맞는 해역만 나온다', () => {
    expect(accessibleSpots('pacific', { boat: 1, level: 5 })).toEqual(['sea']);
    expect(accessibleSpots('pacific', { boat: 0, level: 30 })).toEqual([]);
    expect(accessibleSpots('pacific', { boat: 1, level: 4 })).toEqual([]);
    expect(accessibleSpots('pacific', { boat: 2, level: 7 })).toEqual(['sea', 'deep']);
  });
});

describe('하루 의뢰 계획', () => {
  const player = { boat: 8, level: 33 };
  const rateAt = (spot: SpotId) => rates(spot, player.level, 'idle' as Axis);
  const base: PlanInput = { player, current: rateAt('sthelena'), rateAt, licensed: () => true, seconds: 4 * 3600 };

  it('라이선스가 없으면 계획이 없다', () => {
    expect(planBounties({ ...base, licensed: () => false })).toEqual([]);
  });

  it('라이선스가 있으면 네임드 토벌과 일반 의뢰를 하나씩 고르고 합이 시간 안이다', () => {
    const plan = planBounties(base);
    expect(plan.map(a => a.kind)).toEqual(['named', 'general']);
    expect(plan.reduce((s, a) => s + a.seconds, 0)).toBeLessThanOrEqual(base.seconds);
    for (const a of plan) { expect(a.gain).toBeGreaterThan(0); expect(a.spots.length).toBeGreaterThan(0); }
  });

  it('네임드 보상은 의뢰 데이터 그대로이고 소요 시간은 기대 캐치 수를 캐치 속도로 나눈 값이다', () => {
    const named = planBounties(base).find(a => a.kind === 'named')!;
    expect(BOUNTIES.find(q => q.zone === named.zone && q.difficulty === 'named')!.reward).toBe(named.lump);
    expect(named.seconds).toBeGreaterThan(0.5 * 3600);
    expect(named.seconds).toBeLessThan(3 * 3600);
  });

  it('시간이 모자라면 계획이 없다', () => {
    expect(planBounties({ ...base, seconds: 60 })).toEqual([]);
  });

  it('지금 해역의 수입이 압도적으로 크면 이득이 없어 하지 않는다', () => {
    const current = { ...base.current, goldPerHour: 1e12 };
    expect(planBounties({ ...base, current })).toEqual([]);
  });

  it('배가 모자라 낚을 수 있는 해역이 없는 구역은 건너뛴다', () => {
    const plan = planBounties({ ...base, player: { boat: 0, level: 33 } });
    expect(plan).toEqual([]);
  });
});
