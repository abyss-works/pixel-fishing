// 요리 순환 지표 — 시간 제한 효과의 창(구매 미끼 30분), 레시피 순손익, 가방 한도와 자동 기운 얻기를 넣은 기운 공급.
// 제품 규칙(등급 가중치 효과 합산, 돌연변이 폼 가중치, 가방 용량, 내보낼 개체의 순서)은 불러 쓰고, 이 모듈이 갖는 값은 요리 설계 초안의 레시피와 미끼 수치뿐이다.
// 설계 초안 값은 확정이 아니며, 명세가 바뀌면 이 표를 맞춘다.
import type { SpotId } from '../../../src/game/content/spots';
import { RARITY_ORDER } from '../../../src/game/content/rarity';
import type { RarityId } from '../../../src/game/content/rarity';
import { NO_EFFECT, checkEffect, dexRows, effectRates, spotsAt } from './effects';
import type { DexTimes, Effect } from './effects';
import { axisOf } from './progress';
import type { FlowAxis } from './progress';
import { entryLevel } from '../model';

/** 미끼 슬롯의 지속(분) — 시간 제한 효과 창의 기본 길이 */
export const BAIT_WINDOW_MIN = 30;

/** 구매 미끼의 효과(설계 초안). 희귀 미끼는 희귀 이상, 영웅 미끼는 영웅 이상, 전설 미끼는 전설 등급 가중치에 걸린다 */
export const BAIT_EFFECTS = {
  rare: { ...NO_EFFECT, rare: 0.2 },
  epic: { ...NO_EFFECT, epic: 0.4 },
  legendary: { ...NO_EFFECT, legendary: 0.6 },
} as const satisfies Record<string, Effect>;

export type BaitName = keyof typeof BAIT_EFFECTS;

export function baitEffect(name: string): Effect {
  if (!(name in BAIT_EFFECTS)) throw new Error(`알 수 없는 미끼입니다: ${name} (${Object.keys(BAIT_EFFECTS).join(', ')} 중 하나)`);
  return { ...BAIT_EFFECTS[name as BaitName] };
}

// ── 시간 제한 효과의 창 ──

export interface WindowOptions {
  axis: FlowAxis; effect: Effect; margin: number;
  /** 창 길이(분) */
  minutes: number;
  trials: number; seed: number;
}

export interface WindowRow {
  spot: SpotId; level: number;
  /** 창 안의 등급별 기대 캐치 수(효과 없음, 효과)와 전체 캐치 수 */
  catches: Record<RarityId, { base: number; with: number }>;
  totalBase: number; totalWith: number;
  /** 창 안의 기대 골드와 명성 증가 */
  goldGain: number; fameGain: number;
  /** 창 하나를 쓰고 이후 효과 없이 낚는 도감 완성 시간(시간)의 몬테카를로. with가 창을 쓴 쪽이다 */
  dex: { base: DexTimes; with: DexTimes };
  /** 창 하나가 줄이는 도감 완성 평균 시간(시간). 평균이 없으면(끝내지 못한 시도) null */
  saved: { noLegend: number | null; all: number | null; variant: number | null; epic: number | null; legendary: number | null };
  species: number; epicSpecies: number; legendarySpecies: number;
}

const savedOf = (base: { mean: number | null } | null, now: { mean: number | null } | null): number | null =>
  base?.mean != null && now?.mean != null ? base.mean - now.mean : null;

/** 창 하나의 효과 — 창 안의 등급별 기대 캐치 수와 골드, 명성 증가, 창 하나가 도감 완성 시간을 줄이는 양 */
export function windowRows(o: WindowOptions): WindowRow[] {
  checkEffect(o.effect);
  if (!(o.minutes > 0)) throw new Error('효과 창 길이는 0보다 커야 합니다(분)');
  if (!Number.isInteger(o.trials) || o.trials < 1) throw new Error('시도 횟수는 1 이상의 정수여야 합니다');
  const hours = o.minutes / 60;
  const dex = dexRows({ axis: o.axis, effect: o.effect, margin: o.margin, trials: o.trials, seed: o.seed, windowMinutes: o.minutes });
  return spotsAt(o.margin).map(({ s }, k) => {
    const level = entryLevel(s.id) + o.margin, axis = axisOf(o.axis, s.id, level);
    const base = effectRates(s.id, level, axis, NO_EFFECT), now = effectRates(s.id, level, axis, o.effect);
    const d = dex[k];
    return {
      spot: s.id, level,
      catches: Object.fromEntries(RARITY_ORDER.map(g => [g, {
        base: (base.rarity[g] ?? 0) * base.catchesPerHour * hours, with: (now.rarity[g] ?? 0) * now.catchesPerHour * hours,
      }])) as WindowRow['catches'],
      totalBase: base.catchesPerHour * hours, totalWith: now.catchesPerHour * hours,
      goldGain: (now.goldPerHour - base.goldPerHour) * hours, fameGain: (now.famePerHour - base.famePerHour) * hours,
      dex: { base: d.base, with: d.with },
      saved: {
        noLegend: savedOf(d.base.noLegend, d.with.noLegend), all: savedOf(d.base.all, d.with.all), variant: savedOf(d.base.variant, d.with.variant),
        epic: savedOf(d.base.epic, d.with.epic), legendary: savedOf(d.base.legendary, d.with.legendary),
      },
      species: d.species, epicSpecies: d.epic, legendarySpecies: d.legendary,
    };
  });
}
