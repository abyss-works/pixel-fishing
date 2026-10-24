import type { Artifact, ArtifactEffects } from '../../game/content/artifacts';
import { variantShare } from '../../game/rules/logic';

const EFFECT_ORDER: readonly (keyof ArtifactEffects)[] = ['sail', 'duelSpeedupCut', 'baitDiscount', 'mutationWeight'];

/** 유물 효과 한 가지의 문장 — 효과가 없으면 null이다. 스탯 창 보너스 탭이 효과마다 한 줄로 쓴다 */
export function artifactEffectLine(a: Artifact, effect: keyof ArtifactEffects): string | null {
  const e = a.effects;
  switch (effect) {
    case 'sail': return (e.sail ?? 0) > 0 ? `항해 속도 +${Math.round(e.sail! * 100)}%` : null;
    case 'duelSpeedupCut': return (e.duelSpeedupCut ?? 0) > 0 ? `네임드 결투 가속 −${Math.round(e.duelSpeedupCut! * 100)}%` : null;
    case 'baitDiscount': return (e.baitDiscount ?? 0) > 0 ? `미끼값 −${Math.round(e.baitDiscount! * 100)}%` : null;
    case 'mutationWeight': return e.mutationWeight !== undefined ? `돌연변이 확률 ${Math.round(variantShare(e.mutationWeight) * 100)}%` : null;
  }
}

/** 유물 효과 문장 — data 수치에서 뽑는다. 손으로 적으면 밸런스를 바꾸는 순간 옛 숫자로 남는다.
 *  없는 효과는 행을 내지 않는다. 수배판 유물 카드와 가방 유물 섹션이 함께 쓴다. */
export function artifactEffectLines(a: Artifact): string[] {
  return EFFECT_ORDER.map(effect => artifactEffectLine(a, effect)).filter((line): line is string => line !== null);
}
