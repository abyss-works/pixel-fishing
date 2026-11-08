import type { Artifact, ArtifactEffects } from '../../game/content/artifacts';
import { artifactEffectsAt } from '../../game/rules/artifactLevel';
import { variantShare } from '../../game/rules/logic';

const EFFECT_ORDER: readonly (keyof ArtifactEffects)[] = ['sail', 'duelSpeedupCut', 'baitDiscount', 'mutationWeight'];

/** 유물 효과 한 가지의 문장 - 그 레벨에서의 수치로 쓴다. 효과가 없으면 null이다. 스탯 창 보너스 탭이 효과마다 한 줄로 쓴다 */
export function artifactEffectLine(a: Artifact, effect: keyof ArtifactEffects, level: number): string | null {
  const e = artifactEffectsAt(a, level);
  switch (effect) {
    case 'sail': return (e.sail ?? 0) > 0 ? `항해 속도 +${Math.round(e.sail! * 100)}%` : null;
    case 'duelSpeedupCut': return (e.duelSpeedupCut ?? 0) > 0 ? `네임드 결투 가속 −${Math.round(e.duelSpeedupCut! * 100)}%` : null;
    case 'baitDiscount': return (e.baitDiscount ?? 0) > 0 ? `미끼값 −${Math.round(e.baitDiscount! * 100)}%` : null;
    case 'mutationWeight': return e.mutationWeight !== undefined ? `돌연변이 확률 ${Math.round(variantShare(e.mutationWeight) * 100)}%` : null;
  }
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
    penalty: cut > 0 ? `네임드 토벌 골드 −${Math.round(cut * 100)}%` : null,
  };
}
