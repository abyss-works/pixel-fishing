import { describe, expect, it } from 'vitest';
import { BOUNTIES, BOUNTY_ZONES } from '../../../src/game/content/bounties';
import { SPOTS } from '../../../src/game/content/spots';
import { SPEC_MARGIN, entryLevel, rates } from '../model';
import { applyOverride } from './override';
import { GENERAL_TARGET_HOURS, NAMED_TARGET_HOURS, evReport, roundReward } from './ev';

describe('보상 반올림', () => {
  it('앞 두 자리 유효숫자로 맞춘다', () => {
    expect(roundReward(1_234_567)).toBe(1_200_000);
    expect(roundReward(1_250_000)).toBe(1_300_000);
    expect(roundReward(86_400)).toBe(86_000);
    expect(roundReward(9_990)).toBe(10_000);
  });

  it('두 자리 이하는 정수로 맞춘다', () => {
    expect(roundReward(47.6)).toBe(48);
    expect(roundReward(0)).toBe(0);
  });
});

describe('해역별 방치 EV', () => {
  const r = evReport();
  const spot = (id: string) => r.spots.find(s => s.spot === id)!;

  it('해역마다 한 행이고 딱렙 EV는 모델의 방치 수입과 같다', () => {
    expect(r.spots.map(s => s.spot)).toEqual(SPOTS.map(s => s.id));
    expect(spot('sea').entryLevel).toBe(entryLevel('sea'));
    expect(spot('sea').entryEv).toBe(rates('sea', entryLevel('sea'), 'idle').goldPerHour);
  });

  it('다음 진입 직전 레벨은 다음 해역 딱렙의 한 칸 아래이고 EV가 딱렙 이상이다', () => {
    const s = spot('sea');
    expect(s.preNextLevel).toBe(entryLevel('deep') - 1);
    expect(s.preNextEv).toBe(rates('sea', s.preNextLevel, 'idle').goldPerHour);
    for (const x of r.spots) expect(x.preNextEv, x.spot).toBeGreaterThanOrEqual(x.entryEv);
  });

  it('마지막 해역은 다음이 없어 진입 레벨에 여유 레벨을 더한 값을 쓰고 표시한다', () => {
    const s = r.spots.at(-1)!;
    expect(s.preNextLevel).toBe(s.entryLevel + SPEC_MARGIN);
    expect(s.preNextIsMargin).toBe(true);
    expect(r.spots[0].preNextIsMargin).toBe(false);
  });
});

describe('구역 대표 방치 EV', () => {
  const r = evReport();

  it('의뢰 구역마다 후보 두 가지를 낸다', () => {
    expect(r.zones.map(z => z.zone)).toEqual([...BOUNTY_ZONES]);
  });

  it('후보 하나는 구역 마지막 해역 딱렙, 다른 하나는 구역 해역 딱렙의 평균이다', () => {
    const z = r.zones.find(x => x.zone === 'seasia')!;
    const evs = ['dragonhole', 'coron', 'barrierreef'].map(id => rates(id as 'coron', entryLevel(id as 'coron'), 'idle').goldPerHour);
    expect(z.lastEntryEv).toBeCloseTo(evs[2], 6);
    expect(z.meanEntryEv).toBeCloseTo(evs.reduce((a, b) => a + b, 0) / 3, 6);
  });
});

describe('보상의 EV 시간 환산', () => {
  const r = evReport();
  const row = (zone: string, difficulty: string) => r.rewards.find(x => x.zone === zone && x.difficulty === difficulty)!;

  it('구역마다 쉬움, 보통, 어려움, 네임드 행이 있다', () => {
    expect(r.rewards).toHaveLength(BOUNTY_ZONES.length * 4);
  });

  it('목표 시간은 일반 0.5, 1, 2시간과 네임드 4에서 8시간이다', () => {
    expect(GENERAL_TARGET_HOURS).toEqual({ easy: 0.5, normal: 1, hard: 2 });
    expect(NAMED_TARGET_HOURS).toEqual([4, 8]);
    expect(row('pacific', 'easy').target).toEqual([0.5, 0.5]);
    expect(row('pacific', 'named').target).toEqual([4, 8]);
  });

  it('현재 보상은 의뢰 데이터 그대로이고 시간은 보상을 대표 EV로 나눈 값이다', () => {
    const q = BOUNTIES.find(b => b.zone === 'indian' && b.difficulty === 'hard')!;
    const x = row('indian', 'hard');
    const z = r.zones.find(y => y.zone === 'indian')!;
    expect(x.reward).toBe(q.reward);
    expect(x.hours.last).toBeCloseTo(q.reward / z.lastEntryEv, 9);
    expect(x.hours.mean).toBeCloseTo(q.reward / z.meanEntryEv, 9);
  });

  it('필요 보상은 목표 시간 곱하기 EV를 반올림한 값이다', () => {
    const x = row('indian', 'normal');
    const z = r.zones.find(y => y.zone === 'indian')!;
    expect(x.needed.last[0]).toBe(roundReward(1 * z.lastEntryEv));
    expect(x.needed.mean[1]).toBe(roundReward(1 * z.meanEntryEv));
    const n = row('indian', 'named');
    expect(n.needed.last).toEqual([roundReward(4 * z.lastEntryEv), roundReward(8 * z.lastEntryEv)]);
  });

  it('차이는 목표 범위 안이면 0, 밖이면 가까운 끝과의 시간 차다', () => {
    for (const x of r.rewards) {
      for (const k of ['last', 'mean'] as const) {
        const h = x.hours[k], [lo, hi] = x.target;
        const expected = h < lo ? h - lo : h > hi ? h - hi : 0;
        expect(x.gap[k], `${x.zone} ${x.difficulty} ${k}`).toBeCloseTo(expected, 9);
      }
    }
  });
});

describe('덮어쓰기 반영', () => {
  it('해역 요구 파워를 바꾸면 EV와 환산이 그 값으로 다시 계산된다', () => {
    const base = evReport();
    const restore = applyOverride({ spots: { sthelena: { powerReq: 165 } } });
    let changed;
    try { changed = evReport(); } finally { restore(); }
    const pick = (r: ReturnType<typeof evReport>) => r.spots.find(s => s.spot === 'sthelena')!;
    expect(pick(changed).entryLevel).toBe(pick(base).entryLevel + 3);
    expect(pick(changed).entryEv).toBeGreaterThan(pick(base).entryEv);
    const hours = (r: ReturnType<typeof evReport>) => r.rewards.find(x => x.zone === 'southatlantic' && x.difficulty === 'named')!.hours.last;
    expect(hours(changed)).not.toBe(hours(base));
    expect(evReport()).toEqual(base);
  });
});
