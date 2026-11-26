// 효과 묶음(PlayerContext)과 파생 값 규칙 함수의 단일 출처.
// 모든 공개 함수는 효과 묶음을 필수로 받으며 효과 인자에 기본값을 두지 않는다.
import { ARTIFACTS } from '../content/artifacts.js';
import { WALK_BAG_CAP, boatAt } from '../content/boats.js';
import { recipeById } from '../content/cooking.js';
import type { SpotId } from '../content/spots.js';
import { artifactEffectsAt, artifactLevelOf } from './artifactLevel.js';
import { WALK_SPEED } from './balance.js';
import { activePotionsOf, fortuneEffectMultOf, fortuneOf, luckMultOf } from './fortune.js';
import type { FortuneTarget } from './fortune.js';
import { gameDayOf } from './time.js';
import { appliedSlots, slotEffects } from './cooking.js';
import type { GuildEffects } from './guild.js';
import { boatSpeed, priceOfInstance, rodStats, saleBonusOf } from './logic.js';
import type { FishInstance, GameState } from './logic.js';
import { NIGHT_SPEED_FACTOR, powerZones } from './stats.js';
import type { Movement, Stat, StatMod } from './stats.js';

/** 부동소수 오차를 걷어 낸다 */
const clean = (x: number): number => Math.round(x * 1e9) / 1e9;

const buildStat = (base: number, mods: StatMod[]): Stat => ({
  base,
  mods,
  value: mods.reduce((v, m) => v + m.delta, base),
});

/** 업적 누적 보너스 합계 — 적용 지점에서 한 번에 더해 사용한다 */
export interface AchievementBonuses {
  /** 입질 대기 감소율 합 (0 이상) */
  biteWaitCut: number;
  /** 돌연변이 가중치 증가율 합 */
  mutationWeight: number;
  /** 희귀 이상 등급 가중치 증가율 합 */
  rareWeight: number;
  /** 영웅 이상 등급 가중치 증가율 합 */
  epicWeight: number;
  /** 전설 등급 가중치 증가율 합 */
  legendaryWeight: number;
  /** 밤 어종 가중치 증가율 합 */
  nightWeight: number;
  /** 가방 용량 증가율 합 */
  bagCap: number;
  /** 기운 획득량 증가율 합 */
  energyYield: number;
  /** 미끼 증폭 증가율 합 */
  baitAmplify: number;
  /** 도시락 증폭 증가율 합 */
  lunchAmplify: number;
  /** 판매가 보너스 증가율 합 */
  sellBonus: number;
  /** 네임드 조우 가중치 증가율 합 */
  namedWeight: number;
  /** 이동 속도 증가율 합 */
  moveSpeed: number;
  /** 보유 유물 효과 배율 증가 합 */
  artifactBoost: number;
}

/** 업적 보너스가 없을 때 명시적으로 넘기는 동결 상수 */
export const NO_ACHIEVEMENT_BONUSES: Readonly<AchievementBonuses> = Object.freeze({
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

/** 플레이어 한 명의 파생 값 계산에 필요한 효과 묶음 */
export interface PlayerContext {
  state: GameState;
  guild: GuildEffects;
  now: string;
  achievements: AchievementBonuses;
}

/** 효과 묶음 정규화 — 모든 필드를 필수로 받아 외부 변경으로부터 격리된 묶음을 만든다 */
export function createPlayerContext(input: PlayerContext): PlayerContext {
  return {
    state: input.state,
    guild: { ...input.guild },
    now: input.now,
    achievements: {
      biteWaitCut: input.achievements.biteWaitCut,
      mutationWeight: input.achievements.mutationWeight,
      rareWeight: input.achievements.rareWeight,
      epicWeight: input.achievements.epicWeight,
      legendaryWeight: input.achievements.legendaryWeight,
      nightWeight: input.achievements.nightWeight,
      bagCap: input.achievements.bagCap,
      energyYield: input.achievements.energyYield,
      baitAmplify: input.achievements.baitAmplify,
      lunchAmplify: input.achievements.lunchAmplify,
      sellBonus: input.achievements.sellBonus,
      namedWeight: input.achievements.namedWeight,
      moveSpeed: input.achievements.moveSpeed,
      artifactBoost: input.achievements.artifactBoost,
    },
  };
}

/** 가방 상한 — 배 기본 칸에 길드·업적·유물 가방 용량 보너스를 더하고, 이미 넘겨 든 개체 수(heldCount)로 래칫을 적용한다 */
export function bagCapacityOf(ctx: PlayerContext, heldCount: number): Stat {
  const base = ctx.state.boat < 1 ? WALK_BAG_CAP : boatAt(ctx.state.boat)!.bagCap;
  const mods: StatMod[] = [];
  const relicScale = 1 + ctx.achievements.artifactBoost;
  let bonusSum = ctx.guild.bag;
  if (ctx.guild.bag > 0) {
    mods.push({ id: 'guild-bag', label: '길드 가방 용량', delta: Math.round(base * ctx.guild.bag), source: { kind: 'guild', bonus: 'bag' } });
  }
  if (ctx.achievements.bagCap > 0) {
    bonusSum = clean(bonusSum + ctx.achievements.bagCap);
    mods.push({ id: 'achievement-bagCap', label: '업적 누적', delta: Math.round(base * ctx.achievements.bagCap), source: { kind: 'achievement', id: 'bagCap' } });
  }
  for (const a of ARTIFACTS) {
    const level = artifactLevelOf(ctx.state, a.id);
    if (level === 0) continue;
    const rawBonus = artifactEffectsAt(a, level).bagCap ?? 0;
    const bonus = clean(rawBonus * relicScale);
    if (bonus > 0) {
      bonusSum = clean(bonusSum + bonus);
      mods.push({ id: `relic-${a.id}`, label: a.name, delta: Math.round(base * bonus), source: { kind: 'relic', id: a.id } });
    }
  }
  const cap = base + Math.round(base * bonusSum);
  if (mods.length > 0) {
    // 보너스를 합산해 한 번 반올림한 상한과 항목별 반올림 delta 합이 ±1 어긋나지 않도록 마지막 항목에 차이를 맞춘다
    const rest = mods.slice(0, -1).reduce((sum, mod) => sum + mod.delta, 0);
    mods[mods.length - 1].delta = cap - base - rest;
  }
  return { base, mods, value: Math.max(cap, heldCount) };
}

/** 이동 속도(px/s) — 도보·항해 기본값에 유물(항해 전용, 업적 유물 배율 반영)과 업적 이동 속도를 더하고, 밤 감속 배수를 곱한다 */
export function moveSpeedOf(ctx: PlayerContext, movement: Movement, night: boolean): Stat {
  const base = movement === 'walk' ? WALK_SPEED : boatSpeed(ctx.state);
  const mods: StatMod[] = [];
  const relicScale = 1 + ctx.achievements.artifactBoost;
  for (const a of ARTIFACTS) {
    const level = artifactLevelOf(ctx.state, a.id);
    if (level === 0) continue;
    const rawBonus = movement === 'sail' ? (artifactEffectsAt(a, level).sail ?? 0) : 0;
    const bonus = clean(rawBonus * relicScale);
    if (bonus > 0) {
      mods.push({
        id: `relic-${a.id}`,
        label: a.name,
        delta: base * bonus,
        source: { kind: 'relic', id: a.id },
      });
    }
  }
  if (ctx.achievements.moveSpeed > 0) {
    mods.push({
      id: 'achievement-moveSpeed',
      label: '업적 누적',
      delta: base * ctx.achievements.moveSpeed,
      source: { kind: 'achievement', id: 'moveSpeed' },
    });
  }
  if (night) {
    const preNight = buildStat(base, mods).value;
    mods.push({
      id: 'night',
      label: '밤 항해 감속',
      delta: preNight * (NIGHT_SPEED_FACTOR - 1),
      source: { kind: 'rule', id: 'night' },
    });
  }
  return buildStat(base, mods);
}

/** 유효 입질 대기(초) — 파워 미달 추가, 유물(업적 유물 배율 반영), 업적 입질 대기, 방치 모드 도시락 슬롯(도시락 증폭 반영)을 반영한다 */
export function biteWaitOf(ctx: PlayerContext, spot: SpotId, mode: 'idle' | 'manual'): { min: Stat; max: Stat } {
  const st = rodStats(ctx.state.rod);
  const pz = powerZones(ctx.state, spot);
  const relicScale = 1 + ctx.achievements.artifactBoost;
  const activeSlots = mode === 'idle' ? appliedSlots(ctx.state, ctx.now, 'auto') : {};
  const cook = mode === 'idle' ? slotEffects(ctx.state, ctx.now, 'auto', { lunch: ctx.achievements.lunchAmplify }) : null;
  const lunchId = activeSlots.lunch;
  const lunchRecipe = lunchId ? recipeById(lunchId) : undefined;
  const fortune = fortuneOf(ctx.state, ctx.now);
  const fortuneRatio = clean(fortuneEffectMultOf(fortune, 'biteWait') - 1);
  const activePotions = activePotionsOf(ctx.state.potions, ctx.now);

  const side = (base: number): Stat => {
    const mods: StatMod[] = pz.biteExtra > 0
      ? [{ id: 'power', label: '파워 부족', delta: pz.biteExtra, source: { kind: 'rule', id: 'power' } }]
      : [];
    const total = base + pz.biteExtra;
    for (const a of ARTIFACTS) {
      const level = artifactLevelOf(ctx.state, a.id);
      if (level === 0) continue;
      const rawCut = artifactEffectsAt(a, level).biteWaitCut ?? 0;
      const cut = clean(rawCut * relicScale);
      if (cut > 0) {
        mods.push({
          id: `relic-${a.id}`,
          label: a.name,
          delta: -total * cut,
          source: { kind: 'relic', id: a.id },
        });
      }
    }
    if (ctx.achievements.biteWaitCut > 0) {
      mods.push({
        id: 'achievement-biteWaitCut',
        label: '업적 누적',
        delta: -total * ctx.achievements.biteWaitCut,
        source: { kind: 'achievement', id: 'biteWaitCut' },
      });
    }
    if (cook && cook.biteWaitCut > 0 && lunchId) {
      mods.push({
        id: 'cook-lunch',
        label: lunchRecipe?.name ?? '',
        delta: -total * cook.biteWaitCut,
        source: { kind: 'slot', recipe: lunchId },
      });
    }
    if (fortuneRatio !== 0) {
      const preLuck = buildStat(base, mods).value;
      if (preLuck > 0) {
        mods.push({
          id: 'fortune-biteWait',
          label: '오늘의 운세',
          delta: clean(preLuck * fortuneRatio),
          source: { kind: 'fortune' },
        });
      }
    }
    for (const potion of activePotions) {
      const luck = potion.effects.luck as Partial<Record<FortuneTarget, number>> | undefined;
      const bonus = luck?.biteWait ?? 0;
      if (bonus !== 0) {
        const cur = buildStat(base, mods).value;
        if (cur > 0) {
          mods.push({
            id: `potion-${potion.id}`,
            label: potion.name,
            delta: clean(cur * bonus),
            source: { kind: 'potion', id: potion.id },
          });
        }
      }
    }
    return buildStat(base, mods);
  };
  return { min: side(st.biteMin), max: side(st.biteMax) };
}

/** 판매 수령액 — 선택한 개체의 기본가 합에 길드·업적 판매가 보너스를 한 번 더하고,
 *  재물운이나 판매가 비약이 켜진 날에는 그 합계에 독립 곱연산 배수를 곱한다(서버 판매와 같은 순서 — 반올림은 마지막 곱 뒤 한 번) */
export function saleProceedsOf(ctx: PlayerContext, instances: readonly FishInstance[]): Stat {
  const base = instances.reduce((sum, inst) => sum + priceOfInstance(inst), 0);
  const guildSell = ctx.guild.sell;
  const achSell = ctx.achievements.sellBonus;
  const totalDelta = saleBonusOf(base, clean(guildSell + achSell));
  const fortune = fortuneOf(ctx.state, ctx.now);
  const day = gameDayOf(ctx.now);
  const luck = luckMultOf(fortune, 'sell', ctx.state.potions, day);
  const mods: StatMod[] = [];
  if (guildSell > 0) {
    const d = saleBonusOf(base, guildSell);
    if (d > 0) mods.push({ id: 'guild-sell', label: '길드 판매가', delta: d, source: { kind: 'guild', bonus: 'sell' } });
  }
  if (achSell > 0) {
    const d = saleBonusOf(base, achSell);
    if (d > 0) mods.push({ id: 'achievement-sellBonus', label: '업적 누적', delta: d, source: { kind: 'achievement', id: 'sellBonus' } });
  }
  if (mods.length > 0) {
    const rest = mods.slice(0, -1).reduce((sum, mod) => sum + mod.delta, 0);
    mods[mods.length - 1].delta = totalDelta - rest;
  }
  const preLuck = base + totalDelta;
  const value = Math.round(preLuck * luck);
  const luckDelta = value - preLuck;
  if (luckDelta !== 0) {
    const luckMods: StatMod[] = [];
    let running = preLuck;
    const fortuneBonus = clean(fortuneEffectMultOf(fortune, 'sell') - 1);
    if (fortuneBonus > 0) {
      const d = Math.round(running * fortuneBonus);
      luckMods.push({ id: 'fortune-sell', label: '오늘의 운세', delta: d, source: { kind: 'fortune' } });
      running += d;
    }
    for (const potion of activePotionsOf(ctx.state.potions, ctx.now)) {
      const bonus = potion.effects.luck?.sell ?? 0;
      if (bonus > 0) {
        const d = Math.round(running * bonus);
        luckMods.push({ id: `potion-${potion.id}`, label: potion.name, delta: d, source: { kind: 'potion', id: potion.id } });
        running += d;
      }
    }
    if (luckMods.length > 0) {
      const rest = luckMods.slice(0, -1).reduce((sum, mod) => sum + mod.delta, 0);
      luckMods[luckMods.length - 1].delta = luckDelta - rest;
      mods.push(...luckMods);
    }
  }
  return { base, mods, value };
}
