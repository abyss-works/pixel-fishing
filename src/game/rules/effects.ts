// 효과 묶음(PlayerContext)과 파생 값 규칙 함수의 단일 출처.
// 모든 공개 함수는 효과 묶음을 필수로 받으며 효과 인자에 기본값을 두지 않는다.
import { ARTIFACTS } from '../content/artifacts.js';
import { WALK_BAG_CAP, boatAt } from '../content/boats.js';
import { recipeById } from '../content/cooking.js';
import type { SpotId } from '../content/spots.js';
import type { ZoneId } from '../content/zones.js';
import { artifactEffectsAt, artifactLevelOf } from './artifactLevel.js';
import { WALK_SPEED } from './balance.js';
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
  /** 네임드 조우 가중치 증가율 합 */
  namedWeight: number;
  /** 이동 속도 증가율 합 */
  moveSpeed: number;
  /** 보유 유물 효과 배율 증가 합 */
  artifactBoost: number;
  /** 존별 전설 등급 가중치 증가율 합 */
  zoneLegendary: Partial<Record<ZoneId, number>>;
  /** 존별 돌연변이 가중치 증가율 합 */
  zoneMutation: Partial<Record<ZoneId, number>>;
}

/** 업적 보너스가 없을 때 명시적으로 넘기는 동결 상수 */
export const NO_ACHIEVEMENT_BONUSES: Readonly<AchievementBonuses> = Object.freeze({
  biteWaitCut: 0,
  mutationWeight: 0,
  namedWeight: 0,
  moveSpeed: 0,
  artifactBoost: 0,
  zoneLegendary: Object.freeze({}),
  zoneMutation: Object.freeze({}),
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
      namedWeight: input.achievements.namedWeight,
      moveSpeed: input.achievements.moveSpeed,
      artifactBoost: input.achievements.artifactBoost,
      zoneLegendary: { ...input.achievements.zoneLegendary },
      zoneMutation: { ...input.achievements.zoneMutation },
    },
  };
}

/** 가방 상한 — 배 기본 칸에 길드 가방 용량 보너스를 더하고, 이미 넘겨 든 개체 수(heldCount)로 래칫을 적용한다 */
export function bagCapacityOf(ctx: PlayerContext, heldCount: number): Stat {
  const base = ctx.state.boat < 1 ? WALK_BAG_CAP : boatAt(ctx.state.boat)!.bagCap;
  const guildDelta = ctx.guild.bag > 0 ? Math.round(base * ctx.guild.bag) : 0;
  const mods: StatMod[] = guildDelta > 0
    ? [{ id: 'guild-bag', label: '길드 가방 용량', delta: guildDelta, source: { kind: 'guild', bonus: 'bag' } }]
    : [];
  const cap = base + guildDelta;
  return { base, mods, value: Math.max(cap, heldCount) };
}

/** 이동 속도(px/s) — 도보·항해 기본값에 유물(항해 전용, 업적 유물 배율 반영), 업적 이동 속도, 밤 감속을 반영한다 */
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
      label: '업적 이동 속도',
      delta: base * ctx.achievements.moveSpeed,
      source: { kind: 'achievement', id: 'moveSpeed' },
    });
  }
  if (night) {
    mods.push({
      id: 'night',
      label: '밤 — 어둠 속 이동 감속',
      delta: base * (NIGHT_SPEED_FACTOR - 1),
      source: { kind: 'rule', id: 'night' },
    });
  }
  return buildStat(base, mods);
}

/** 유효 입질 대기(초) — 파워 미달 추가, 유물(업적 유물 배율 반영), 업적 입질 대기, 방치 모드 도시락 슬롯을 반영한다 */
export function biteWaitOf(ctx: PlayerContext, spot: SpotId, mode: 'idle' | 'manual'): { min: Stat; max: Stat } {
  const st = rodStats(ctx.state.rod);
  const pz = powerZones(ctx.state, spot);
  const relicScale = 1 + ctx.achievements.artifactBoost;
  const activeSlots = mode === 'idle' ? appliedSlots(ctx.state, ctx.now, 'auto') : {};
  const cook = mode === 'idle' ? slotEffects(ctx.state, ctx.now, 'auto') : null;
  const lunchId = activeSlots.lunch;
  const lunchRecipe = lunchId ? recipeById(lunchId) : undefined;

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
        label: '업적 입질 대기',
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
    return buildStat(base, mods);
  };
  return { min: side(st.biteMin), max: side(st.biteMax) };
}

/** 판매 수령액 — 선택한 개체의 기본가 합에 길드 판매가 보너스를 한 번 더한다 */
export function saleProceedsOf(ctx: PlayerContext, instances: readonly FishInstance[]): Stat {
  const base = instances.reduce((sum, inst) => sum + priceOfInstance(inst), 0);
  const delta = saleBonusOf(base, ctx.guild.sell);
  const mods: StatMod[] = delta > 0
    ? [{ id: 'guild-sell', label: '길드 판매가', delta, source: { kind: 'guild', bonus: 'sell' } }]
    : [];
  return { base, mods, value: base + delta };
}
