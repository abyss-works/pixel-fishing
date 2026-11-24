// 운세 — 하루(게임 날짜, KST 04:00 경계) 하나의 작은 행운 보너스.
// 추첨·날짜 키 고정·대상별 운 배율(마지막 곱)의 규칙 테스트다.
import { describe, it, expect } from 'vitest';
import { applyAction } from './actions';
import type { ActionDeps } from './actions';
import { ensureFortune, fortuneOf, luckMultOf, rollFortune, safeFortune } from './fortune';
import type { DailyFortune } from './fortune';
import {
  FISH, fishDrawShares, migrate, namedWeightsOf, newState, priceOfInstance, rollFish, sellSelected,
} from './logic';
import type { FishInstance, FormId, GameState } from './logic';
import type { BountyCtx } from './rules';
import { gameDayOf } from './time';

const NOW = '2026-08-22T03:00:00.000Z';      // KST 12:00 → 게임 날짜 2026-08-22
const DAY = gameDayOf(NOW);                  // '2026-08-22'
const NEXT_NOW = '2026-08-22T19:00:00.000Z'; // KST 다음날 04:00 → 게임 날짜 2026-08-23
const NEXT_DAY = gameDayOf(NEXT_NOW);

const rngOf = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };
// 분포 검증용 결정적 난수 — 같은 시드면 같은 흐름
const mulberry32 = (a: number) => () => {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const deps = (over: Partial<ActionDeps> = {}): ActionDeps => {
  let n = 0;
  return {
    rng: () => 0.5, today: '2026-08-22', now: NOW, newUid: () => `uid-${++n}`, ...over,
  };
};

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });
const mkInst = (uid: string, fishId: string, form: FormId = 'normal', locked = false): FishInstance =>
  ({ uid, fishId, form, size: 20, caughtAt: null, spot: null, judgment: null, locked });
const ctx = (over: Partial<BountyCtx> = {}): BountyCtx => ({
  clearsToday: { general: 0, named: 0 }, tickets: [], complete: [], active: [], ...over,
});

describe('rollFortune — 운세 추첨', () => {
  it('종류는 세 가지를 균등하게 뽑는다 — rng 1회', () => {
    expect(rollFortune(DAY, rngOf(0, 0.5)).kind).toBe('fish');    // 하위 1/3
    expect(rollFortune(DAY, rngOf(0.5, 0.5)).kind).toBe('gold');  // 중간 1/3
    expect(rollFortune(DAY, rngOf(0.9, 0.5)).kind).toBe('shadow'); // 상위 1/3
  });

  it('지수는 3(40%)과 5(60%) 둘 중 하나다 — rng 1회', () => {
    expect(rollFortune(DAY, rngOf(0, 0.39)).index).toBe(3);
    expect(rollFortune(DAY, rngOf(0, 0.4)).index).toBe(5);
    expect(rollFortune(DAY, rngOf(0, 0.99)).index).toBe(5);
  });

  it('굴린 게임 날짜를 그대로 새긴다', () => {
    expect(rollFortune('2030-01-01', rngOf(0, 0)).day).toBe('2030-01-01');
  });

  it('분포 — 종류 균등(1/3), 지수 3이 40%', () => {
    const rng = mulberry32(42);
    const kinds = { fish: 0, gold: 0, shadow: 0 };
    let threes = 0;
    const n = 30_000;
    for (let i = 0; i < n; i++) {
      const f = rollFortune('d', rng);
      kinds[f.kind]++;
      if (f.index === 3) threes++;
    }
    for (const k of Object.values(kinds)) expect(k / n).toBeCloseTo(1 / 3, 1);
    expect(threes / n).toBeCloseTo(0.4, 1);
  });
});

describe('ensureFortune — 게임 날짜 키로 고정', () => {
  it('운세가 없으면 굴려 그날의 운세로 고정한다', () => {
    const st = ensureFortune(seed(), NOW, rngOf(0.5, 0.5));
    expect(st.fortune).toEqual({ day: DAY, kind: 'gold', index: 5 });
  });

  it('같은 게임 날짜면 이미 굴린 운세를 그대로 쓴다 — rng를 소모하지 않는다', () => {
    const fortune: DailyFortune = { day: DAY, kind: 'shadow', index: 3 };
    const st = seed({ fortune });
    expect(ensureFortune(st, NOW, () => { throw new Error('rng 호출 금지'); })).toBe(st);
  });

  it('게임 날짜가 바뀌면 새로 굴린다 — 날짜 경계(KST 04:00)를 쓴다', () => {
    const st = ensureFortune(
      seed({ fortune: { day: DAY, kind: 'fish', index: 3 } }), NEXT_NOW, rngOf(0.9, 0.9),
    );
    expect(st.fortune).toEqual({ day: NEXT_DAY, kind: 'shadow', index: 5 });
  });

  it('운세가 아닌 나머지 상태는 건드리지 않는다', () => {
    const base = seed({ gold: 123, boat: 2 });
    const st = ensureFortune(base, NOW, rngOf(0, 0));
    expect(st).toMatchObject({ gold: 123, boat: 2 });
  });
});

describe('fortuneOf — 지금 게임 날짜의 운세만', () => {
  it('그날의 운세를 돌려주고, 날짜가 지난 운세는 없는 것으로 본다', () => {
    const fortune: DailyFortune = { day: DAY, kind: 'fish', index: 5 };
    expect(fortuneOf(seed({ fortune }), NOW)).toEqual(fortune);
    expect(fortuneOf(seed({ fortune }), NEXT_NOW)).toBeNull();
    expect(fortuneOf(seed(), NOW)).toBeNull();
  });
});

describe('luckMultOf — 대상별 운 배율', () => {
  it('운세 종류가 정한 대상에만 1 + 지수/100을 곱한다', () => {
    expect(luckMultOf({ day: DAY, kind: 'fish', index: 5 }, 'rarity')).toBeCloseTo(1.05, 9);
    expect(luckMultOf({ day: DAY, kind: 'gold', index: 3 }, 'sell')).toBeCloseTo(1.03, 9);
    expect(luckMultOf({ day: DAY, kind: 'shadow', index: 5 }, 'named')).toBeCloseTo(1.05, 9);
  });

  it('대상이 아닌 운세·운세 없음은 배율 1이다 — 페널티는 없다', () => {
    const fishLuck: DailyFortune = { day: DAY, kind: 'fish', index: 5 };
    expect(luckMultOf(fishLuck, 'sell')).toBe(1);
    expect(luckMultOf(fishLuck, 'named')).toBe(1);
    expect(luckMultOf(null, 'rarity')).toBe(1);
    expect(luckMultOf(null, 'sell')).toBe(1);
    expect(luckMultOf(null, 'named')).toBe(1);
  });
});

describe('safeFortune — 세이브 위생 (기존 세이브에 없어도 동작)', () => {
  it('필드가 없는 세이브는 null로 둔다 — 다음 판정에서 새로 굴린다', () => {
    const raw = { ...newState() } as Record<string, unknown>;
    delete raw.fortune;
    expect(migrate(raw).fortune).toBeNull();
    expect(safeFortune(undefined)).toBeNull();
  });

  it('날짜·종류·지수가 모두 성립하는 운세는 보존한다', () => {
    const fortune = { day: '2026-08-22', kind: 'shadow', index: 3 };
    expect(migrate({ ...newState(), fortune }).fortune).toEqual(fortune);
  });

  it('형태가 틀리면 버린다', () => {
    for (const bad of [
      5, 'gold', [],
      { day: '2026-08-22' },
      { day: '2026-08-22', kind: 'luck', index: 5 },
      { day: '2026-08-22', kind: 'gold', index: 4 },
      { day: 7, kind: 'gold', index: 5 },
      { day: '', kind: 'gold', index: 5 },
    ]) {
      expect(migrate({ ...newState(), fortune: bad }).fortune).toBeNull();
    }
  });
});

describe('운 배율 적용 — 판매(돈 운)', () => {
  it('sellSelected에 운 배율이 마지막 곱으로 들어간다 — 다른 보너스 적용 뒤 수령액에 곱한다', () => {
    const bag = [mkInst('a', 'carp')];
    const st = seed({ bag });
    const base = priceOfInstance(bag[0]);
    const noLuck = sellSelected(st, ['a'], 0.1);
    expect(noLuck.gold).toBe(base + Math.round(base * 0.1));
    // 길드 보너스(+10%)를 적용한 수령액에 ×1.05 — 한 번 반올림한다
    const lucky = sellSelected(st, ['a'], 0.1, 1.05);
    expect(lucky.gold).toBe(Math.round(noLuck.gold * 1.05));
    expect(lucky.bag).toEqual([]);
  });

  it('applyAction sell — 그날의 돈 운세가 수령액에 운 배율을 곱한다', () => {
    const bag = [mkInst('a', 'carp')];
    const st = seed({ bag, fortune: { day: DAY, kind: 'gold', index: 5 } });
    const out = applyAction(st, { type: 'sell', uids: ['a'] }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(Math.round(priceOfInstance(bag[0]) * 1.05));
    expect(out.state.fortune).toEqual({ day: DAY, kind: 'gold', index: 5 });
  });

  it('applyAction sell — 다른 종류의 운세는 판매가에 걸리지 않는다', () => {
    const bag = [mkInst('a', 'carp')];
    const st = seed({ bag, fortune: { day: DAY, kind: 'fish', index: 5 } });
    const out = applyAction(st, { type: 'sell', uids: ['a'] }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(priceOfInstance(bag[0]));
  });

  it('applyAction sell — 운세가 없으면 판매가 첫 판정에서 굴려 고정한다', () => {
    const bag = [mkInst('a', 'carp')];
    const out = applyAction(seed({ bag }), { type: 'sell', uids: ['a'] }, deps({ rng: () => 0.5 }));
    if (!out.ok) throw new Error(out.error);
    // rng 0.5 → 돈 운 지수 5 — 같은 판정에서 바로 배율이 걸린다
    expect(out.state.fortune).toEqual({ day: DAY, kind: 'gold', index: 5 });
    expect(out.state.gold).toBe(Math.round(priceOfInstance(bag[0]) * 1.05));
  });

  it('날짜가 지난 운세는 새로 굴린다 — 어제 운세가 오늘 판정에 걸리지 않는다', () => {
    const bag = [mkInst('a', 'carp')];
    const st = seed({ bag, fortune: { day: '2020-01-01', kind: 'gold', index: 5 } });
    // rng 0.9 → 그림자 운 — 판매 대상이 아니라 수령액은 기본가 그대로
    const out = applyAction(st, { type: 'sell', uids: ['a'] }, deps({ rng: () => 0.9 }));
    if (!out.ok) throw new Error(out.error);
    expect(out.state.fortune).toEqual({ day: DAY, kind: 'shadow', index: 5 });
    expect(out.state.gold).toBe(priceOfInstance(bag[0]));
  });
});

describe('운 배율 적용 — 등급 가중치(물고기 운)', () => {
  it('rarityLuck은 희귀 이상 등급 가중치에만 곱해진다 — 일반 등급은 그대로다', () => {
    const gradeShares = (luck?: number) => {
      const acc: Record<string, number> = {};
      for (const { fish, share } of fishDrawShares('pond', luck === undefined ? {} : { rarityLuck: luck })) {
        acc[fish.rarity] = (acc[fish.rarity] ?? 0) + share;
      }
      return acc;
    };
    const plain = gradeShares();
    const lucky = gradeShares(2);
    expect(lucky.rare).toBeGreaterThan(plain.rare);
    expect(lucky.epic).toBeGreaterThan(plain.epic);
    expect(lucky.legendary).toBeGreaterThan(plain.legendary);
    expect(lucky.common).toBeLessThan(plain.common); // 상대적으로 밀린다 — 일반 가중치 자체는 불변
  });

  it('운 배율이 크면 희귀 이상만 나온다 — 추첨 경계에서 배율이 살아난다', () => {
    // 연못 일반 가중치가 압도적이라 배율 없이는 rng 0.5가 항상 일반이다
    expect(rollFish('pond', 1, () => 0.5, 1).rarity).toBe('common');
    expect(rollFish('pond', 1, () => 0.5, 1, { rarityLuck: 100 }).rarity).not.toBe('common');
  });

  it('applyAction catch — 그날의 물고기 운세가 등급 가중치에 운 배율을 곱한다', () => {
    // 물고기 운 지수 5(×1.05)로만 희귀 이상이 되는 경계 난수를 잰다 — 등급 단계의 첫 항목은 일반이다
    const commonShare = (luck?: number) =>
      fishDrawShares('pond', luck === undefined ? {} : { rarityLuck: luck })
      .filter(r => r.fish.rarity === 'common').reduce((s, r) => s + r.share, 0);
    const r = (commonShare(1) + commonShare(1.05)) / 2;
    const plain = applyAction(seed({ fortune: { day: DAY, kind: 'gold', index: 5 } }),
      { type: 'catch', spot: 'pond', judgment: 'normal' }, deps({ rng: () => r }));
    const lucky = applyAction(seed({ fortune: { day: DAY, kind: 'fish', index: 5 } }),
      { type: 'catch', spot: 'pond', judgment: 'normal' }, deps({ rng: () => r }));
    if (!plain.ok || !lucky.ok) throw new Error('catch failed');
    const plainFish = FISH.find(f => f.id === plain.state.bag.at(-1)!.fishId)!;
    const luckyFish = FISH.find(f => f.id === lucky.state.bag.at(-1)!.fishId)!;
    expect(plainFish.rarity).toBe('common');
    expect(luckyFish.rarity).not.toBe('common');
  });

  it('applyAction catch — 운세가 없으면 첫 판정에서 굴려 고정하고 상태에 남긴다', () => {
    const out = applyAction(seed(), { type: 'catch', spot: 'pond', judgment: 'normal' }, deps({ rng: () => 0.9 }));
    if (!out.ok) throw new Error(out.error);
    expect(out.state.fortune).toEqual({ day: DAY, kind: 'shadow', index: 5 });
    // 같은 날짜의 다음 판정은 같은 운세를 쓴다 — 다시 굴리지 않는다(불변)
    const again = applyAction(out.state, { type: 'sell', uids: [] }, deps({ rng: () => 0 }));
    if (!again.ok) throw new Error(again.error);
    expect(again.state.fortune).toEqual(out.state.fortune);
  });
});

describe('운 배율 적용 — 네임드 조우(그림자 운)', () => {
  it('namedWeightsOf에 운 배율이 마지막 곱으로 들어간다', () => {
    const w = namedWeightsOf('sea');
    expect(namedWeightsOf('sea', 0, 1.05)).toEqual({ named: w.named * 1.05, none: w.none });
    // 다른 보너스(+25%) 적용 뒤 ×1.05
    expect(namedWeightsOf('sea', 0.25, 1.05)).toEqual({ named: w.named * 1.25 * 1.05, none: w.none });
  });

  it('applyAction catch — 그날의 그림자 운세가 네임드 조우 가중치에 운 배율을 곱한다', () => {
    const sea = seed({ boat: 1 });
    const bounty = ctx({ active: ['pacific-named-megalodon'] });
    const w = namedWeightsOf('sea');
    // 운 배율 ×1.05로만 명중하는 난수 — 배율 없이 경계 위, 배율 경계 아래
    const r = (w.named / (w.named + w.none) + w.named * 1.05 / (w.named * 1.05 + w.none)) / 2;
    const plain = applyAction(
      seed({ ...sea, fortune: { day: DAY, kind: 'gold', index: 5 } }),
      { type: 'catch', spot: 'sea', judgment: 'auto' }, deps({ rng: () => r, bounty }));
    const lucky = applyAction(
      seed({ ...sea, fortune: { day: DAY, kind: 'shadow', index: 5 } }),
      { type: 'catch', spot: 'sea', judgment: 'auto' }, deps({ rng: () => r, bounty }));
    if (!plain.ok || !lucky.ok) throw new Error('catch failed');
    expect(plain.events.some(e => e.type === 'ticket')).toBe(false);
    expect(lucky.events.find(e => e.type === 'ticket')?.payload).toEqual({ questId: 'pacific-named-megalodon' });
  });
});
