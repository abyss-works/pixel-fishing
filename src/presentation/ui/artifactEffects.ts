import type { Artifact } from '../../game/content/artifacts';
import { artifactEffectsAt, artifactExtraCookChanceAt } from '../../game/rules/artifactLevel';
import { MUTATION_WEIGHTS } from '../../game/rules/balance';
import type { ArtifactEffectKey } from '../../features/gameplay/model/stats';
import { fmtDecimal2 } from './format';

const EFFECT_ORDER: readonly ArtifactEffectKey[] = ['sail', 'duelSpeedupCut', 'mutationWeight', 'biteWaitCut', 'commonWeightCut', 'bagCap', 'extraCookChance'];

const EFFECT_LABEL: Record<ArtifactEffectKey, string> = {
  sail: '항해 속도',
  duelSpeedupCut: '네임드 결투 가속',
  mutationWeight: '돌연변이 출현 비중',
  biteWaitCut: '입질 대기',
  commonWeightCut: '일반 어종 출현 비중',
  bagCap: '가방 용량',
  extraCookChance: '요리 추가 완성',
};

/** 부동소수 오차를 걷어 낸다 */
const clean = (x: number): number => Math.round(x * 1e9) / 1e9;

/** 줄어드는 효과의 값 문자열(`−N%`) */
const fmtCutPercent = (rate: number): string => `−${fmtDecimal2(rate * 100)}%`;

/** 유물 효과 한 가지의 이름 - 효과 문장의 앞부분과 비교 표의 행 이름이 함께 쓴다 */
export const artifactEffectLabel = (effect: ArtifactEffectKey): string => EFFECT_LABEL[effect];

/** 유물 효과 한 가지의 값 문자열 - 그 레벨의 수치를 소수 둘째 자리까지(끝의 0은 뺀다) 쓴다. scale이 주어지면 보유 유물 효과 배율을 곱한다. 효과가 없으면 null이다 */
export function artifactEffectValue(a: Artifact, effect: ArtifactEffectKey, level: number, scale = 1): string | null {
  const e = artifactEffectsAt(a, level);
  switch (effect) {
    case 'sail': return (e.sail ?? 0) > 0 ? `+${fmtDecimal2(clean(e.sail! * scale) * 100)}%` : null;
    case 'duelSpeedupCut': return (e.duelSpeedupCut ?? 0) > 0 ? fmtCutPercent(clean(e.duelSpeedupCut! * scale)) : null;
    case 'biteWaitCut': return (e.biteWaitCut ?? 0) > 0 ? fmtCutPercent(clean(e.biteWaitCut! * scale)) : null;
    case 'commonWeightCut': return (e.commonWeightCut ?? 0) > 0 ? fmtCutPercent(clean(e.commonWeightCut! * scale)) : null;
    case 'bagCap': return (e.bagCap ?? 0) > 0 ? `+${fmtDecimal2(clean(e.bagCap! * scale) * 100)}%` : null;
    case 'extraCookChance': {
      const chance = artifactExtraCookChanceAt(a, level);
      return chance > 0 ? `+${fmtDecimal2(Math.min(1, clean(chance * scale)) * 100)}%` : null;
    }
    case 'mutationWeight': return e.mutationWeight !== undefined
      ? `+${fmtDecimal2(clean((e.mutationWeight.variant / MUTATION_WEIGHTS.variant - 1) * scale) * 100)}%`
      : null;
  }
}

/** 이 유물이 가진 효과의 종류 - 표시 순서대로. 레벨과 무관하다 */
export function artifactEffectKeys(a: Artifact): (ArtifactEffectKey)[] {
  return EFFECT_ORDER.filter(effect => artifactEffectValue(a, effect, 1) !== null);
}

/** 유물 효과 한 가지의 문장 - 그 레벨에서의 수치로 쓴다. scale이 주어지면 보유 유물 효과 배율을 곱한다. 효과가 없으면 null이다 */
export function artifactEffectLine(a: Artifact, effect: ArtifactEffectKey, level: number, scale = 1): string | null {
  const value = artifactEffectValue(a, effect, level, scale);
  if (value === null) return null;
  return `${artifactEffectLabel(effect)} ${value}`;
}

/** 유물 효과 문장 - data 수치와 레벨 계수에서 뽑는다. 손으로 적으면 밸런스를 바꾸는 순간 옛 숫자로 남는다.
 *  없는 효과는 행을 내지 않는다. 수배판 유물 카드와 가방 유물 섹션이 함께 쓴다. */
export function artifactEffectLines(a: Artifact, level: number): string[] {
  return EFFECT_ORDER.map(effect => artifactEffectLine(a, effect, level)).filter((line): line is string => line !== null);
}

/** 전설 유물이 시스템에 거는 효과의 문장 - 보너스(네임드 토벌 하루 횟수·미끼 슬롯)와 페널티(네임드 토벌 골드·미끼 지속 시간).
 *  해당하는 효과가 없으면 각각 null이다 */
export function artifactSystemLines(a: Artifact): { bonus: string | null; penalty: string | null } {
  const sys = a.system;
  if (!sys) return { bonus: null, penalty: null };
  const bonuses: string[] = [];
  if ((sys.namedCapBonus ?? 0) > 0) bonuses.push(`네임드 토벌 하루 +${sys.namedCapBonus}번`);
  if ((sys.extraBaitSlots ?? 0) > 0) bonuses.push(`미끼 칸 +${sys.extraBaitSlots}칸`);
  const penalties: string[] = [];
  if ((sys.namedRewardCut ?? 0) > 0) penalties.push(`네임드 토벌 골드 ${fmtCutPercent(sys.namedRewardCut!)}`);
  if ((sys.baitDurationCut ?? 0) > 0) penalties.push(`미끼 지속 시간 ${fmtCutPercent(sys.baitDurationCut!)}`);
  return {
    bonus: bonuses.length > 0 ? bonuses.join(', ') : null,
    penalty: penalties.length > 0 ? penalties.join(', ') : null,
  };
}
