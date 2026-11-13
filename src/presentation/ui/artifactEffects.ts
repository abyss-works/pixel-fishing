import type { Artifact } from '../../game/content/artifacts';
import { artifactEffectsAt, artifactExtraCookChanceAt } from '../../game/rules/artifactLevel';
import { MUTATION_WEIGHTS } from '../../game/rules/balance';
import type { ArtifactEffectKey } from '../../features/gameplay/model/stats';
import { fmtDecimal2, fmtPlusPoint } from './format';

const EFFECT_ORDER: readonly ArtifactEffectKey[] = ['sail', 'duelSpeedupCut', 'mutationWeight', 'biteWaitCut', 'extraCookChance'];

const EFFECT_LABEL: Record<ArtifactEffectKey, string> = {
  sail: '항해 속도',
  duelSpeedupCut: '네임드 결투 가속',
  mutationWeight: '돌연변이 가중치',
  biteWaitCut: '입질 대기',
  extraCookChance: '요리 추가 완성',
};

/** 줄어드는 효과의 값 문자열(`−N%`) */
const fmtCutPercent = (rate: number): string => `−${fmtDecimal2(rate * 100)}%`;

/** 유물 효과 한 가지의 이름 - 효과 문장의 앞부분과 비교 표의 행 이름이 함께 쓴다 */
export const artifactEffectLabel = (effect: ArtifactEffectKey): string => EFFECT_LABEL[effect];

/** 유물 효과 한 가지의 값 문자열 - 그 레벨의 수치를 소수 둘째 자리까지(끝의 0은 뺀다) 쓴다. 효과가 없으면 null이다 */
export function artifactEffectValue(a: Artifact, effect: ArtifactEffectKey, level: number): string | null {
  const e = artifactEffectsAt(a, level);
  switch (effect) {
    case 'sail': return (e.sail ?? 0) > 0 ? `+${fmtDecimal2(e.sail! * 100)}%` : null;
    case 'duelSpeedupCut': return (e.duelSpeedupCut ?? 0) > 0 ? fmtCutPercent(e.duelSpeedupCut!) : null;
    case 'biteWaitCut': return (e.biteWaitCut ?? 0) > 0 ? fmtCutPercent(e.biteWaitCut!) : null;
    case 'extraCookChance': {
      const chance = artifactExtraCookChanceAt(a, level);
      return chance > 0 ? fmtPlusPoint(chance * 100) : null; // 확률에 직접 더하는 효과는 %p
    }
    case 'mutationWeight': return e.mutationWeight !== undefined ? `+${fmtDecimal2((e.mutationWeight.variant / MUTATION_WEIGHTS.variant - 1) * 100)}%` : null;
  }
}

/** 이 유물이 가진 효과의 종류 - 표시 순서대로. 레벨과 무관하다 */
export function artifactEffectKeys(a: Artifact): (ArtifactEffectKey)[] {
  return EFFECT_ORDER.filter(effect => artifactEffectValue(a, effect, 1) !== null);
}

/** 유물 효과 한 가지의 문장 - 그 레벨에서의 수치로 쓴다. 효과가 없으면 null이다. 스탯 창 보너스 탭이 효과마다 한 줄로 쓴다 */
export function artifactEffectLine(a: Artifact, effect: ArtifactEffectKey, level: number): string | null {
  const value = artifactEffectValue(a, effect, level);
  if (value === null) return null;
  return `${artifactEffectLabel(effect)} ${value}`;
}

/** 유물 효과 문장 - data 수치와 레벨 계수에서 뽑는다. 손으로 적으면 밸런스를 바꾸는 순간 옛 숫자로 남는다.
 *  없는 효과는 행을 내지 않는다. 수배판 유물 카드와 가방 유물 섹션이 함께 쓴다. */
export function artifactEffectLines(a: Artifact, level: number): string[] {
  return EFFECT_ORDER.map(effect => artifactEffectLine(a, effect, level)).filter((line): line is string => line !== null);
}

/** 전설 유물이 시스템에 거는 효과의 문장 - 보너스(네임드 토벌 하루 횟수)와 페널티(네임드 토벌 골드).
 *  해당하는 효과가 없으면 각각 null이다 */
export function artifactSystemLines(a: Artifact): { bonus: string | null; penalty: string | null } {
  const bonus = a.system?.namedCapBonus ?? 0;
  const cut = a.system?.namedRewardCut ?? 0;
  return {
    bonus: bonus > 0 ? `네임드 토벌 하루 +${bonus}번` : null,
    penalty: cut > 0 ? `네임드 토벌 골드 −${fmtDecimal2(cut * 100)}%` : null,
  };
}
