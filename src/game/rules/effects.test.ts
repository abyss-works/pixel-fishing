// 효과 묶음(PlayerContext)과 값 규칙 함수의 계약을 검증한다.
import { describe, expect, it } from 'vitest';
import {
  NO_ACHIEVEMENT_BONUSES,
  bagCapacityOf,
  biteWaitOf,
  createPlayerContext,
  moveSpeedOf,
  saleProceedsOf,
} from './effects';
import type { AchievementBonuses, PlayerContext } from './effects';
import { NO_GUILD_EFFECTS, guildEffectsOf } from './guild';
import {
  BOATS,
  bagCapacity,
  newState,
  priceOfInstance,
  rodStats,
  sellSelected,
} from './logic';
import type { FishInstance, GameState } from './logic';
import { WALK_SPEED } from './balance';
import { NIGHT_SPEED_FACTOR } from './stats';

const NOW = '2026-11-21T05:00:00.000Z';
const FUTURE = '2026-11-21T06:00:00.000Z';
const PAST = '2026-11-21T04:00:00.000Z';

const makeState = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

const makeCtx = (
  over: Partial<Omit<PlayerContext, 'state' | 'achievements'>> & {
    state?: Partial<GameState>;
    achievements?: Partial<AchievementBonuses>;
  } = {},
): PlayerContext => createPlayerContext({
  state: makeState(over.state),
  guild: over.guild ?? NO_GUILD_EFFECTS,
  now: over.now ?? NOW,
  achievements: { ...NO_ACHIEVEMENT_BONUSES, ...over.achievements },
});

const sampleFish = (uid: string, fishId = 'crucian', form: 'normal' | 'variant' = 'normal'): FishInstance => ({
  uid,
  fishId,
  form,
  size: 20,
  caughtAt: NOW,
  spot: 'pond',
  judgment: 'good',
  locked: false,
});

describe('NO_ACHIEVEMENT_BONUSES 및 createPlayerContext', () => {
  it('NO_ACHIEVEMENT_BONUSES는 모든 값이 0이고 동결돼 있다', () => {
    expect(Object.isFrozen(NO_ACHIEVEMENT_BONUSES)).toBe(true);
    expect(NO_ACHIEVEMENT_BONUSES).toEqual({
      biteWaitCut: 0,
      mutationWeight: 0,
      rareWeight: 0,
      epicWeight: 0,
      legendaryWeight: 0,
      nightWeight: 0,
      bagCap: 0,
      energyYield: 0,
      baitAmplify: 0,
      lunchAmplify: 0,
      sellBonus: 0,
      namedWeight: 0,
      moveSpeed: 0,
      artifactBoost: 0,
    });
  });

  it('createPlayerContext는 필수 필드를 정규화해 새 묶음을 만든다', () => {
    const state = makeState({ boat: 3, rod: 10 });
    const guild = { ...NO_GUILD_EFFECTS, bag: 0.08 };
    const achievements: AchievementBonuses = {
      ...NO_ACHIEVEMENT_BONUSES,
      moveSpeed: 0.05,
      bagCap: 0.1,
      nightWeight: 0.075,
    };
    const ctx = createPlayerContext({ state, guild, now: NOW, achievements });
    expect(ctx.state).toBe(state);
    expect(ctx.guild).toEqual(guild);
    expect(ctx.guild).not.toBe(guild);
    expect(ctx.now).toBe(NOW);
    expect(ctx.achievements).toEqual(achievements);
    expect(ctx.achievements).not.toBe(achievements);
  });
});

describe('bagCapacityOf', () => {
  it('길드 보너스가 없으면 기존 bagCapacity와 완전히 일치한다', () => {
    for (const boat of [0, 1, 4, 8]) {
      const state = makeState({ boat });
      const bag = Array.from({ length: 70 }, (_, i) => sampleFish(`u-${i}`));
      const ctx = createPlayerContext({
        state: { ...state, bag },
        guild: NO_GUILD_EFFECTS,
        now: NOW,
        achievements: NO_ACHIEVEMENT_BONUSES,
      });
      const stat = bagCapacityOf(ctx, bag.length);
      expect(stat.value).toBe(bagCapacity(boat, bag, 0));
      expect(stat.mods).toEqual([]);
    }
  });

  it('길드 가방 보너스와 래칫이 반영되고 source 메타데이터를 싣는다', () => {
    const guild = guildEffectsOf(4, { bag: 4 }); // 16%
    const ctx = makeCtx({ state: { boat: 8 }, guild });
    const stat = bagCapacityOf(ctx, 100);
    expect(stat.base).toBe(BOATS[7].bagCap); // 4000
    expect(stat.mods).toEqual([
      {
        id: 'guild-bag',
        label: '길드 가방 용량',
        delta: 640,
        source: { kind: 'guild', bonus: 'bag' },
      },
    ]);
    expect(stat.value).toBe(4640);

    // 래칫: 이미 상한을 넘겨 들고 있으면 heldCount가 최종 value
    const ratcheted = bagCapacityOf(ctx, 5000);
    expect(ratcheted.value).toBe(5000);
    expect(ratcheted.base).toBe(4000);
  });

  it('가방 용량 유물(bagCap) + 유물 배율 + 길드 가방 동시 적용 시 mods 합계와 cap이 일치하고 래칫 시 heldCount를 유지한다', async () => {
    const { ARTIFACTS } = await import('../content/artifacts');
    const target = ARTIFACTS[0] as { id: string; grade: 'common' | 'rare' | 'epic' | 'legendary'; effects: { bagCap?: number } };
    const origGrade = target.grade;
    const origEffects = target.effects;
    target.grade = 'rare';
    target.effects = { bagCap: 0.1 };
    try {
      // 60 * 0.04 = 2.4(2), 60 * (0.1 * 1.03) = 6.18(6), 합산 60 * 0.143 = 8.58(9) — 반올림 차이가 나는 조합
      const guild = guildEffectsOf(2, { bag: 1 }); // +4%
      const lv1Ctx = makeCtx({
        state: { boat: 0, artifacts: [target.id] },
        guild,
        achievements: { artifactBoost: 0.03 },
      });
      const lv1 = bagCapacityOf(lv1Ctx, 10);
      expect(lv1.base).toBe(60);
      expect(lv1.mods.map(m => m.source)).toEqual([
        { kind: 'guild', bonus: 'bag' },
        { kind: 'relic', id: target.id },
      ]);
      expect(lv1.mods.reduce((s, m) => s + m.delta, lv1.base)).toBe(lv1.value);
      expect(lv1.value).toBe(69);

      // Lv5(20%) + artifactBoost(15%) + guild(20%) + 배(boat 8: base 4000)
      const lv5Ctx = makeCtx({
        state: { boat: 8, artifacts: [target.id], artifactLevels: { [target.id]: 5 } },
        guild: guildEffectsOf(5, { bag: 5 }), // +20%
        achievements: { artifactBoost: 0.15 }, // 0.2 * 1.15 = 0.23, 합산 0.43
      });
      const lv5 = bagCapacityOf(lv5Ctx, 100);
      expect(lv5.base).toBe(BOATS[7].bagCap);
      expect(lv5.mods.map(m => m.source)).toEqual([
        { kind: 'guild', bonus: 'bag' },
        { kind: 'relic', id: target.id },
      ]);
      expect(lv5.mods.reduce((s, m) => s + m.delta, lv5.base)).toBe(lv5.value);
      expect(lv5.value).toBe(4000 + Math.round(4000 * 0.43));

      // 래칫: 상한 초과 보유 시 value는 heldCount를 유지하고, mods 합계는 기본+보정 상한과 일치한다
      const ratcheted = bagCapacityOf(lv1Ctx, 100);
      expect(ratcheted.value).toBe(100);
      expect(ratcheted.mods.reduce((s, m) => s + m.delta, ratcheted.base)).toBe(69);

      // 전설 유물은 artifactLevelOf가 5여도 레벨 계수를 곱하지 않고 Lv1 효과(0.1)만 적용한다
      target.grade = 'legendary';
      const legendCtx = makeCtx({ state: { boat: 0, artifacts: [target.id] } });
      const legendCap = bagCapacityOf(legendCtx, 10);
      expect(legendCap.value).toBe(66);
    } finally {
      target.grade = origGrade;
      target.effects = origEffects;
    }
  });

  it('업적 누적 가방 용량(bagCap)이 길드·유물과 합산되고 출처 mod를 남긴다', () => {
    const ctx = makeCtx({
      state: { boat: 8 },
      guild: guildEffectsOf(2, { bag: 1 }), // +4%
      achievements: { bagCap: 0.1 }, // +10%
    });
    const stat = bagCapacityOf(ctx, 100);
    expect(stat.base).toBe(BOATS[7].bagCap);
    expect(stat.mods.map(m => m.id)).toEqual(['guild-bag', 'achievement-bagCap']);
    expect(stat.mods[1].source).toEqual({ kind: 'achievement', id: 'bagCap' });
    expect(stat.value).toBe(4000 + Math.round(4000 * 0.14));
    expect(stat.mods.reduce((s, m) => s + m.delta, stat.base)).toBe(stat.value);
  });
});

describe('moveSpeedOf', () => {
  it('보너스가 없으면 낮·밤·도보·항해 기본값과 밤 감속 배수(×0.85)를 반영한다', () => {
    expect(moveSpeedOf(makeCtx({ state: { boat: 3 } }), 'walk', false).value).toBe(WALK_SPEED);
    expect(moveSpeedOf(makeCtx({ state: { boat: 0 } }), 'sail', false).value).toBe(BOATS[0].speed);
    expect(moveSpeedOf(makeCtx({ state: { boat: 3 } }), 'sail', false).value).toBe(BOATS[2].speed);

    const nightSail = moveSpeedOf(makeCtx({ state: { boat: 3 } }), 'sail', true);
    expect(nightSail.mods.map(m => m.id)).toEqual(['night']);
    expect(nightSail.value).toBeCloseTo(BOATS[2].speed * NIGHT_SPEED_FACTOR, 10);

    const nightWalk = moveSpeedOf(makeCtx({ state: { boat: 3 } }), 'walk', true);
    expect(nightWalk.value).toBeCloseTo(WALK_SPEED * NIGHT_SPEED_FACTOR, 10);
  });

  it('밤 감속(NIGHT_SPEED_FACTOR)은 유물·업적 보너스 합산(preNight)에 곱연산으로 걸린다', () => {
    const ctx = makeCtx({
      state: { boat: 1, artifacts: ['wreck-compass'] }, // base 110, sail +10%
      achievements: { moveSpeed: 0.05, artifactBoost: 0.2 }, // relic +12%, ach +5% → preNight = base * 1.17
    });
    const st = moveSpeedOf(ctx, 'sail', true);
    const base = BOATS[0].speed;
    const preNight = base * (1 + 0.12 + 0.05);
    expect(st.base).toBe(base);
    expect(st.mods).toHaveLength(3);
    expect(st.mods[0]).toMatchObject({
      id: 'relic-wreck-compass',
      source: { kind: 'relic', id: 'wreck-compass' },
    });
    expect(st.mods[0].delta).toBeCloseTo(base * 0.1 * 1.2, 10);
    expect(st.mods[1]).toMatchObject({
      id: 'achievement-moveSpeed',
      source: { kind: 'achievement', id: 'moveSpeed' },
    });
    expect(st.mods[1].delta).toBeCloseTo(base * 0.05, 10);
    expect(st.mods[2]).toMatchObject({
      id: 'night',
      source: { kind: 'rule', id: 'night' },
    });
    expect(st.mods[2].delta).toBeCloseTo(preNight * (NIGHT_SPEED_FACTOR - 1), 10);
    expect(st.value).toBeCloseTo(preNight * NIGHT_SPEED_FACTOR, 10);

    // 도보에서는 항해 유물 미적용, 업적 이동 속도는 적용
    const walk = moveSpeedOf(ctx, 'walk', false);
    expect(walk.base).toBe(WALK_SPEED);
    expect(walk.mods.map(m => m.id)).toEqual(['achievement-moveSpeed']);
    expect(walk.value).toBeCloseTo(WALK_SPEED * 1.05, 10);
  });
});

describe('biteWaitOf', () => {
  it('보너스가 없으면 낚싯대 입질 대기와 파워 부족 가산을 그대로 반환한다', () => {
    const st = rodStats(5);
    const actual = biteWaitOf(makeCtx({ state: { rod: 5 } }), 'pond', 'manual');
    expect(actual.min.base).toBe(st.biteMin);
    expect(actual.min.value).toBeCloseTo(st.biteMin, 10);
    expect(actual.max.base).toBe(st.biteMax);
    expect(actual.max.value).toBeCloseTo(st.biteMax, 10);
  });

  it('도시락 슬롯은 idle일 때만 반영되고 lunchAmplify 증폭 배수가 도시락 기본 효과에 곱해진다', () => {
    const activeCtx = makeCtx({
      state: {
        rod: 10,
        slots: { lunch: { id: 'cook-lunch-bite', endsAt: FUTURE }, bait: null },
      },
      now: NOW,
      achievements: { lunchAmplify: 0.15 }, // 기본 -10% × 1.15 = -11.5%
    });
    const idle = biteWaitOf(activeCtx, 'pond', 'idle');
    const manual = biteWaitOf(activeCtx, 'pond', 'manual');
    expect(idle.min.mods).toHaveLength(1);
    expect(idle.min.mods[0]).toMatchObject({
      id: 'cook-lunch',
      source: { kind: 'slot', recipe: 'cook-lunch-bite' },
    });
    expect(idle.min.value).toBeCloseTo(idle.min.base * (1 - 0.1 * 1.15), 10);
    expect(manual.min.mods).toEqual([]);
    expect(manual.min.value).toBeCloseTo(manual.min.base, 10);

    const expiredCtx = makeCtx({
      state: {
        rod: 10,
        slots: { lunch: { id: 'cook-lunch-bite', endsAt: PAST }, bait: null },
      },
      now: NOW,
      achievements: { lunchAmplify: 0.15 },
    });
    expect(biteWaitOf(expiredCtx, 'pond', 'idle').min.mods).toEqual([]);
  });

  it('유물(artifactBoost 포함)과 업적 입질 대기 감소가 반영되고 0이면 mod를 추가하지 않는다', () => {
    const ctx = makeCtx({
      state: { rod: 10, artifacts: ['outer-isle-sinker'] }, // Lv1 biteWaitCut = 0.1
      achievements: { biteWaitCut: 0.05, artifactBoost: 0.5 }, // relic 0.15, ach 0.05
    });
    const wait = biteWaitOf(ctx, 'pond', 'manual');
    expect(wait.min.mods.map(m => m.id)).toEqual(['relic-outer-isle-sinker', 'achievement-biteWaitCut']);
    expect(wait.min.mods[0].source).toEqual({ kind: 'relic', id: 'outer-isle-sinker' });
    expect(wait.min.mods[1].source).toEqual({ kind: 'achievement', id: 'biteWaitCut' });
    expect(wait.min.value).toBeCloseTo(wait.min.base * (1 - 0.15 - 0.05), 10);
    expect(wait.max.value).toBeCloseTo(wait.max.base * (1 - 0.15 - 0.05), 10);
  });
});

describe('saleProceedsOf', () => {
  it('길드 보너스가 0일 때와 있을 때 모두 기존 sellSelected 수령액과 완전히 일치한다', () => {
    const bag = [
      sampleFish('f1', 'crucian', 'normal'),
      sampleFish('f2', 'crucian', 'variant'),
    ];
    const baseSum = bag.reduce((s, i) => s + priceOfInstance(i), 0);

    const noGuildState = makeState({ gold: 0, bag });
    const noGuildCtx = createPlayerContext({
      state: noGuildState,
      guild: NO_GUILD_EFFECTS,
      now: NOW,
      achievements: NO_ACHIEVEMENT_BONUSES,
    });
    const res0 = saleProceedsOf(noGuildCtx, bag);
    expect(res0.base).toBe(baseSum);
    expect(res0.mods).toEqual([]);
    expect(res0.value).toBe(sellSelected(noGuildState, ['f1', 'f2'], 0).gold);

    const guild = guildEffectsOf(1, { sell: 3 }); // +6%
    const guildCtx = createPlayerContext({
      state: noGuildState,
      guild,
      now: NOW,
      achievements: NO_ACHIEVEMENT_BONUSES,
    });
    const resG = saleProceedsOf(guildCtx, bag);
    expect(resG.base).toBe(baseSum);
    expect(resG.value).toBe(sellSelected(noGuildState, ['f1', 'f2'], guild.sell).gold);
    expect(resG.mods).toEqual([
      {
        id: 'guild-sell',
        label: '길드 판매가',
        delta: resG.value - baseSum,
        source: { kind: 'guild', bonus: 'sell' },
      },
    ]);

    const bigBag = Array.from({ length: 10 }, (_, i) => sampleFish(`b${i}`, 'crucian', 'variant'));
    const bigBase = bigBag.reduce((s, i) => s + priceOfInstance(i), 0);
    const achCtx = createPlayerContext({
      state: makeState({ gold: 0, bag: bigBag }),
      guild,
      now: NOW,
      achievements: { ...NO_ACHIEVEMENT_BONUSES, sellBonus: 0.03 },
    });
    const resGA = saleProceedsOf(achCtx, bigBag);
    expect(resGA.base).toBe(bigBase);
    expect(resGA.value).toBe(sellSelected(makeState({ gold: 0, bag: bigBag }), bigBag.map(f => f.uid), 0.09).gold);
    expect(resGA.mods.map(m => m.id)).toEqual(['guild-sell', 'achievement-sellBonus']);
  });

  it('재물운(gold) 활성 시 판매 예상 금액에 행운 배수(×1.05/×1.10)를 마지막에 곱하고 오늘의 운세 mod를 남긴다', () => {
    // NOW = 2026-11-21T05:00:00.000Z (KST 14:00) → 게임 날짜 2026-11-21
    const bag = Array.from({ length: 10 }, (_, i) => sampleFish(`g${i}`, 'crucian', 'variant'));
    const baseSum = bag.reduce((s, i) => s + priceOfInstance(i), 0);
    const guild = guildEffectsOf(1, { sell: 3 }); // +6%

    for (const [index, luck] of [[3, 1.05], [5, 1.10]] as const) {
      const plainCtx = makeCtx({
        state: { bag, fortune: { day: '2026-11-21', kind: 'gold', index } },
      });
      const plainRes = saleProceedsOf(plainCtx, bag);
      expect(plainRes.value).toBe(Math.round(baseSum * luck));
      expect(plainRes.value).toBe(sellSelected(plainCtx.state, bag.map(f => f.uid), 0, luck).gold);
      expect(plainRes.mods).toEqual([
        {
          id: 'fortune-sell',
          label: '오늘의 운세',
          delta: plainRes.value - baseSum,
          source: { kind: 'fortune' },
        },
      ]);

      // 길드 + 업적 보너스 합산 후 행운 배수 마지막 곱 — sellSelected와 일치해야 한다
      const stackedCtx = makeCtx({
        state: { bag, fortune: { day: '2026-11-21', kind: 'gold', index } },
        guild,
        achievements: { sellBonus: 0.03 },
      });
      const stackedRes = saleProceedsOf(stackedCtx, bag);
      expect(stackedRes.value).toBe(sellSelected(stackedCtx.state, bag.map(f => f.uid), 0.09, luck).gold);
      expect(stackedRes.mods.map(m => m.id)).toEqual(['guild-sell', 'achievement-sellBonus', 'fortune-sell']);
      expect(stackedRes.mods[2].source).toEqual({ kind: 'fortune' });
      expect(stackedRes.mods[2].label).toBe('오늘의 운세');
      expect(stackedRes.mods.reduce((s, m) => s + m.delta, stackedRes.base)).toBe(stackedRes.value);
    }
  });

  it('다른 종류의 운세·날짜가 지난 재물운·빈 선택에는 행운 배수 mod를 적용하지 않는다', () => {
    const bag = Array.from({ length: 10 }, (_, i) => sampleFish(`f${i}`, 'crucian', 'variant'));
    const baseSum = bag.reduce((s, i) => s + priceOfInstance(i), 0);

    for (const kind of ['fish', 'shadow'] as const) {
      const res = saleProceedsOf(makeCtx({
        state: { bag, fortune: { day: '2026-11-21', kind, index: 5 } },
      }), bag);
      expect(res.value).toBe(baseSum);
      expect(res.mods).toEqual([]);
    }

    // KST 04:00 경계 직전(2026-11-21 18:59:59Z = KST 2026-11-22 03:59:59)에는 2026-11-21 운세가 살아 있고,
    // 경계 시각(19:00:00Z = KST 04:00:00) 이후에는 만료된다
    const fortune = { day: '2026-11-21', kind: 'gold' as const, index: 5 as const };
    const active = saleProceedsOf(makeCtx({
      state: { bag, fortune },
      now: '2026-11-21T18:59:59.000Z',
    }), bag);
    expect(active.value).toBe(Math.round(baseSum * 1.10));
    expect(active.mods.map(m => m.id)).toEqual(['fortune-sell']);

    const expired = saleProceedsOf(makeCtx({
      state: { bag, fortune },
      now: '2026-11-21T19:00:00.000Z',
    }), bag);
    expect(expired.value).toBe(baseSum);
    expect(expired.mods).toEqual([]);

    // 빈 선택이나 반올림 증가분이 0인 소액 선택에서는 fortune-sell mod를 추가하지 않는다
    const empty = saleProceedsOf(makeCtx({
      state: { fortune },
    }), []);
    expect(empty).toEqual({ base: 0, mods: [], value: 0 });

    const tiny = [sampleFish('tiny', 'crucian', 'normal')];
    const tinyPrice = priceOfInstance(tiny[0]);
    expect(Math.round(tinyPrice * 1.05)).toBe(tinyPrice);
    const tinyRes = saleProceedsOf(makeCtx({ state: { bag: tiny, fortune } }), tiny);
    expect(tinyRes).toEqual({ base: tinyPrice, mods: [], value: tinyPrice });
  });

  it('활성 비약이 판매 예상 금액에 운세와 독립 곱연산되고 출처 mod를 남긴다', () => {
    const bag = Array.from({ length: 10 }, (_, i) => sampleFish(`p${i}`, 'crucian', 'variant'));
    const baseSum = bag.reduce((s, i) => s + priceOfInstance(i), 0);
    const potions = { 'luck-small': '2026-11-21' };

    // 비약만 활성
    const potionOnly = saleProceedsOf(makeCtx({ state: { bag, potions } }), bag);
    expect(potionOnly.value).toBe(Math.round(baseSum * 1.05));
    expect(potionOnly.mods).toEqual([
      {
        id: 'potion-luck-small',
        label: '작은 바다 영약',
        delta: potionOnly.value - baseSum,
        source: { kind: 'potion', id: 'luck-small' },
      },
    ]);

    // 재물운(×1.10) × 작은 바다 영약(×1.05) = ×1.155
    const combined = saleProceedsOf(makeCtx({
      state: { bag, potions, fortune: { day: '2026-11-21', kind: 'gold', index: 5 } },
    }), bag);
    expect(combined.value).toBe(Math.round(baseSum * 1.155));
    expect(combined.mods.map(m => m.id)).toEqual(['fortune-sell', 'potion-luck-small']);
    expect(combined.mods.reduce((s, m) => s + m.delta, combined.base)).toBe(combined.value);

    // KST 04:00 경계 이후 만료된 비약은 무시한다
    const expired = saleProceedsOf(makeCtx({
      state: { bag, potions },
      now: '2026-11-21T19:00:00.000Z',
    }), bag);
    expect(expired.value).toBe(baseSum);
    expect(expired.mods).toEqual([]);
  });
});

describe('biteWaitOf 운세(biteWait)', () => {
  it('입질 대기 단축 운세(×0.95/×0.90)가 합연산 보너스 뒤 마지막 곱연산으로 적용된다', () => {
    const base = biteWaitOf(makeCtx({ state: { rod: 1 } }), 'pond', 'manual');
    const withAch = biteWaitOf(makeCtx({
      state: { rod: 1 },
      achievements: { biteWaitCut: 0.1 },
    }), 'pond', 'manual');
    const withBite3 = biteWaitOf(makeCtx({
      state: { rod: 1, fortune: { day: '2026-11-21', kind: 'bite', index: 3 } },
      achievements: { biteWaitCut: 0.1 },
    }), 'pond', 'manual');
    const withBite5 = biteWaitOf(makeCtx({
      state: { rod: 1, fortune: { day: '2026-11-21', kind: 'bite', index: 5 } },
    }), 'pond', 'idle');

    expect(withBite3.min.value).toBeCloseTo(withAch.min.value * 0.95, 9);
    expect(withBite3.max.value).toBeCloseTo(withAch.max.value * 0.95, 9);
    expect(withBite3.min.mods.at(-1)).toMatchObject({
      id: 'fortune-biteWait',
      label: '오늘의 운세',
      source: { kind: 'fortune' },
    });
    expect(withBite5.min.value).toBeCloseTo(base.min.value * 0.90, 9);
    expect(withBite5.max.value).toBeCloseTo(base.max.value * 0.90, 9);
  });
});
