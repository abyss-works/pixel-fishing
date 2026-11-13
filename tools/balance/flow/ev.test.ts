import { describe, expect, it } from 'vitest';
import { BOUNTIES, BOUNTY_ZONES } from '../../../src/game/content/bounties';
import { SPOTS } from '../../../src/game/content/spots';
import { SPEC_MARGIN, entryLevel, rates } from '../model';
import { applyOverride } from './override';
import { GENERAL_TARGET_HOURS, NAMED_TARGET_HOURS, evReport, roundReward } from './ev';

describe('보상 반올림', () => {
  // 해석: 정수 자릿수가 n이면 5 x 10^(n-2) 단위로 맞춘다(첫 두 자리가 5의 배수가 된다)
  it('앞 두 자리가 5의 배수가 되게 맞춘다', () => {
    expect(roundReward(486_391)).toBe(500_000);
    expect(roundReward(72_000)).toBe(70_000);
    expect(roundReward(15_600_000)).toBe(15_000_000);
    expect(roundReward(20_652)).toBe(20_000);
    expect(roundReward(413_000)).toBe(400_000);
  });

  it('앞 두 자리가 1로 시작하면 5 단위라 134,000은 150,000이 된다', () => {
    expect(roundReward(134_000)).toBe(150_000);
    expect(roundReward(122_000)).toBe(100_000);
  });

  it('자릿수가 올라가는 경계에서 올림한다', () => {
    expect(roundReward(99_999)).toBe(100_000);
    expect(roundReward(997_000)).toBe(1_000_000);
  });

  it('세 자리 미만은 5 단위, 한 자리는 정수로 맞춘다', () => {
    expect(roundReward(47.6)).toBe(50);
    expect(roundReward(12)).toBe(10);
    expect(roundReward(7.4)).toBe(7);
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

  it('의뢰 구역마다 마지막 해역의 딱렙 EV 하나를 낸다', () => {
    expect(r.zones.map(z => z.zone)).toEqual([...BOUNTY_ZONES]);
    const seasia = r.zones.find(x => x.zone === 'seasia')!;
    expect(seasia.ev).toBe(rates('barrierreef', entryLevel('barrierreef'), 'idle').goldPerHour);
    expect(r.zones.find(x => x.zone === 'pacific')!.ev).toBe(rates('deep', entryLevel('deep'), 'idle').goldPerHour);
  });
});

describe('보상의 EV 시간 환산', () => {
  const r = evReport();
  const row = (zone: string, difficulty: string) => r.rewards.find(x => x.zone === zone && x.difficulty === difficulty)!;
  const ev = (zone: string) => r.zones.find(y => y.zone === zone)!.ev;

  it('구역마다 쉬움, 보통, 어려움, 네임드 행이 있다', () => {
    expect(r.rewards).toHaveLength(BOUNTY_ZONES.length * 4);
  });

  it('목표 시간은 일반 1, 2, 4시간과 네임드 8시간 한 값이다', () => {
    expect(GENERAL_TARGET_HOURS).toEqual({ easy: 1, normal: 2, hard: 4 });
    expect(NAMED_TARGET_HOURS).toBe(8);
    expect(row('pacific', 'easy').targetHours).toBe(1);
    expect(row('pacific', 'named').targetHours).toBe(8);
  });

  it('현재 보상은 의뢰 데이터 그대로이고 시간은 보상을 구역 대표 EV로 나눈 값이다', () => {
    const q = BOUNTIES.find(b => b.zone === 'indian' && b.difficulty === 'hard')!;
    const x = row('indian', 'hard');
    expect(x.reward).toBe(q.reward);
    expect(x.hours).toBeCloseTo(q.reward / ev('indian'), 9);
    expect(x.gap).toBeCloseTo(x.hours - 4, 9);
  });

  it('새 보상은 목표 시간 곱하기 EV를 반올림한 값이고 변화율은 지금 보상 대비다', () => {
    for (const x of r.rewards) {
      expect(x.next, `${x.zone} ${x.difficulty}`).toBe(roundReward(x.targetHours * ev(x.zone)));
      expect(x.change).toBeCloseTo(x.next / x.reward - 1, 12);
    }
  });
});

describe('덮어쓰기 반영', () => {
  it('해역 요구 파워를 바꾸면 EV와 환산이 그 값으로 다시 계산된다', () => {
    const base = evReport();
    const restore = applyOverride({ spots: { sthelena: { powerReq: 155 } } });
    let changed;
    try { changed = evReport(); } finally { restore(); }
    const pick = (r: ReturnType<typeof evReport>) => r.spots.find(s => s.spot === 'sthelena')!;
    expect(pick(changed).entryLevel).toBe(pick(base).entryLevel + 3);
    expect(pick(changed).entryEv).toBeGreaterThan(pick(base).entryEv);
    const hours = (r: ReturnType<typeof evReport>) => r.rewards.find(x => x.zone === 'southatlantic' && x.difficulty === 'named')!.hours;
    expect(hours(changed)).not.toBe(hours(base));
    expect(evReport()).toEqual(base);
  });
});

describe('해역 사이 딱렙 방치 EV 증가율', () => {
  it('옵션이 없으면 증가율 열을 담지 않는다', () => {
    expect(evReport().growth).toBeUndefined();
  });

  it('인접한 해역마다 뒤 딱렙 EV ÷ 앞 딱렙 EV - 1과 요구 파워, 레벨 간격을 낸다', () => {
    const r = evReport({ growth: true });
    expect(r.growth!.length).toBe(SPOTS.length - 1);
    r.growth!.forEach((g, i) => {
      const a = r.spots[i], b = r.spots[i + 1];
      expect(g.from).toBe(a.spot);
      expect(g.to).toBe(b.spot);
      expect(g.fromEv).toBe(a.entryEv);
      expect(g.toEv).toBe(b.entryEv);
      expect(g.growth).toBeCloseTo(b.entryEv / a.entryEv - 1, 12);
      expect(g.powerGap).toBe((SPOTS[i + 1].powerReq ?? 0) - (SPOTS[i].powerReq ?? 0));
      expect(g.levelGap).toBe(b.entryLevel - a.entryLevel);
    });
  });

  it('가상 해역을 더하면 그 해역까지 증가율을 낸다', () => {
    const restore = applyOverride({ addSpots: [{ id: 'next', like: 'sthelena', powerReq: 170, growth: 0.45 }] });
    try {
      expect(evReport({ growth: true }).growth!.at(-1)!.growth).toBeCloseTo(0.45, 6);
    } finally { restore(); }
  });
});
