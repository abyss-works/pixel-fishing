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
  sellSelected,
} from './logic';
import type { FishInstance, GameState } from './logic';
import { WALK_SPEED } from './balance';
import { NIGHT_SPEED_FACTOR, effectiveBite, moveSpeed } from './stats';

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
    expect(Object.isFrozen(NO_ACHIEVEMENT_BONUSES.zoneLegendary)).toBe(true);
    expect(Object.isFrozen(NO_ACHIEVEMENT_BONUSES.zoneMutation)).toBe(true);
    expect(NO_ACHIEVEMENT_BONUSES).toEqual({
      biteWaitCut: 0,
      mutationWeight: 0,
      namedWeight: 0,
      moveSpeed: 0,
      artifactBoost: 0,
      zoneLegendary: {},
      zoneMutation: {},
    });
  });

  it('createPlayerContext는 필수 필드를 정규화해 새 묶음을 만든다', () => {
    const state = makeState({ boat: 3, rod: 10 });
    const guild = { ...NO_GUILD_EFFECTS, bag: 0.08 };
    const achievements: AchievementBonuses = {
      ...NO_ACHIEVEMENT_BONUSES,
      moveSpeed: 0.05,
      zoneLegendary: { pacific: 0.1 },
      zoneMutation: { seasia: 0.05 },
    };
    const ctx = createPlayerContext({ state, guild, now: NOW, achievements });
    expect(ctx.state).toBe(state);
    expect(ctx.guild).toEqual(guild);
    expect(ctx.guild).not.toBe(guild);
    expect(ctx.now).toBe(NOW);
    expect(ctx.achievements).toEqual(achievements);
    expect(ctx.achievements.zoneLegendary).not.toBe(achievements.zoneLegendary);
    expect(ctx.achievements.zoneMutation).not.toBe(achievements.zoneMutation);
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

  it('사르가소의 그물망(Lv1·Lv5) + 유물 배율 + 길드 가방 동시 적용 시 mods 합계와 cap이 일치하고 래칫 시 heldCount를 유지한다', () => {
    // 60 * 0.04 = 2.4(2), 60 * (0.1 * 1.03) = 6.18(6), 합산 60 * 0.143 = 8.58(9) — 반올림 차이가 나는 조합
    const guild = guildEffectsOf(2, { bag: 1 }); // +4%
    const lv1Ctx = makeCtx({
      state: { boat: 0, artifacts: ['sargasso-net'] },
      guild,
      achievements: { artifactBoost: 0.03 },
    });
    const lv1 = bagCapacityOf(lv1Ctx, 10);
    expect(lv1.base).toBe(60);
    expect(lv1.mods.map(m => m.source)).toEqual([
      { kind: 'guild', bonus: 'bag' },
      { kind: 'relic', id: 'sargasso-net' },
    ]);
    expect(lv1.mods.reduce((s, m) => s + m.delta, lv1.base)).toBe(lv1.value);
    expect(lv1.value).toBe(69);

    // Lv5(20%) + artifactBoost(15%) + guild(20%) + 배(boat 8: base 4000)
    const lv5Ctx = makeCtx({
      state: { boat: 8, artifacts: ['sargasso-net'], artifactLevels: { 'sargasso-net': 5 } },
      guild: guildEffectsOf(5, { bag: 5 }), // +20%
      achievements: { artifactBoost: 0.15 }, // 0.2 * 1.15 = 0.23, 합산 0.43
    });
    const lv5 = bagCapacityOf(lv5Ctx, 100);
    expect(lv5.base).toBe(BOATS[7].bagCap);
    expect(lv5.mods.map(m => m.source)).toEqual([
      { kind: 'guild', bonus: 'bag' },
      { kind: 'relic', id: 'sargasso-net' },
    ]);
    expect(lv5.mods.reduce((s, m) => s + m.delta, lv5.base)).toBe(lv5.value);
    expect(lv5.value).toBe(4000 + Math.round(4000 * 0.43));

    // 래칫: 상한 초과 보유 시 value는 heldCount를 유지하고, mods 합계는 기본+보정 상한과 일치한다
    const ratcheted = bagCapacityOf(lv1Ctx, 100);
    expect(ratcheted.value).toBe(100);
    expect(ratcheted.mods.reduce((s, m) => s + m.delta, ratcheted.base)).toBe(69);
  });
});

describe('moveSpeedOf', () => {
  it('효과가 0이면 낮·밤·도보·항해 모두 기존 moveSpeed와 완전히 일치한다', () => {
    for (const boat of [0, 1, 3]) {
      for (const movement of ['walk', 'sail'] as const) {
        for (const night of [false, true]) {
          const state = makeState({ boat, artifacts: ['wreck-compass'] });
          const ctx = createPlayerContext({
            state,
            guild: NO_GUILD_EFFECTS,
            now: NOW,
            achievements: NO_ACHIEVEMENT_BONUSES,
          });
          const actual = moveSpeedOf(ctx, movement, night);
          const legacy = moveSpeed(state, movement, night);
          expect(actual.base).toBe(legacy.base);
          expect(actual.value).toBeCloseTo(legacy.value, 10);
          expect(actual.mods.map(m => ({ id: m.id, delta: m.delta }))).toEqual(
            legacy.mods.map(m => ({ id: m.id, delta: m.delta })),
          );
        }
      }
    }
  });

  it('밤 감속, 유물(artifactBoost 포함), 업적 이동 속도가 반영되고 0이면 mod를 추가하지 않는다', () => {
    const ctx = makeCtx({
      state: { boat: 1, artifacts: ['wreck-compass'] }, // base 110, sail +10%
      achievements: { moveSpeed: 0.05, artifactBoost: 0.2 }, // relic +12%, ach +5%
    });
    const st = moveSpeedOf(ctx, 'sail', true);
    const base = BOATS[0].speed;
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
    expect(st.mods[2].delta).toBeCloseTo(base * (NIGHT_SPEED_FACTOR - 1), 10);
    expect(st.value).toBeCloseTo(base * (1 + 0.12 + 0.05 + (NIGHT_SPEED_FACTOR - 1)), 10);

    // 도보에서는 항해 유물 미적용, 업적 이동 속도는 적용
    const walk = moveSpeedOf(ctx, 'walk', false);
    expect(walk.base).toBe(WALK_SPEED);
    expect(walk.mods.map(m => m.id)).toEqual(['achievement-moveSpeed']);
    expect(walk.value).toBeCloseTo(WALK_SPEED * 1.05, 10);
  });
});

describe('biteWaitOf', () => {
  it('효과가 0이면 manual은 기존 effectiveBite(요리 없음)와 완전히 일치한다', () => {
    const state = makeState({ rod: 5, artifacts: ['outer-isle-sinker'] });
    const ctx = createPlayerContext({
      state,
      guild: NO_GUILD_EFFECTS,
      now: NOW,
      achievements: NO_ACHIEVEMENT_BONUSES,
    });
    const actual = biteWaitOf(ctx, 'barrierreef', 'manual');
    const legacy = effectiveBite(state, 'barrierreef');
    expect(actual.min.base).toBe(legacy.min.base);
    expect(actual.min.value).toBeCloseTo(legacy.min.value, 10);
    expect(actual.max.base).toBe(legacy.max.base);
    expect(actual.max.value).toBeCloseTo(legacy.max.value, 10);
  });

  it('도시락 슬롯은 idle일 때만 반영되고 manual과 만료 슬롯에서는 반영되지 않는다', () => {
    const activeCtx = makeCtx({
      state: {
        rod: 10,
        slots: { lunch: { id: 'cook-lunch-bite', endsAt: FUTURE }, bait: null },
      },
      now: NOW,
    });
    const idle = biteWaitOf(activeCtx, 'pond', 'idle');
    const manual = biteWaitOf(activeCtx, 'pond', 'manual');
    expect(idle.min.mods).toHaveLength(1);
    expect(idle.min.mods[0]).toMatchObject({
      id: 'cook-lunch',
      source: { kind: 'slot', recipe: 'cook-lunch-bite' },
    });
    expect(idle.min.value).toBeCloseTo(idle.min.base * 0.9, 10);
    expect(manual.min.mods).toEqual([]);
    expect(manual.min.value).toBeCloseTo(manual.min.base, 10);

    const expiredCtx = makeCtx({
      state: {
        rod: 10,
        slots: { lunch: { id: 'cook-lunch-bite', endsAt: PAST }, bait: null },
      },
      now: NOW,
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
  });
});
