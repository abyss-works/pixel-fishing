import type { Artifact } from '../../game/content/artifacts';

/** 유물 효과 문장 — data 수치에서 뽑는다. 손으로 적으면 밸런스를 바꾸는 순간 옛 숫자로 남는다.
 *  없는 효과는 행을 내지 않는다. 수배판 유물 카드와 가방 유물 섹션이 함께 쓴다. */
export function artifactEffectLines(a: Artifact): string[] {
  const out: string[] = [];
  if ((a.effects.sail ?? 0) > 0) out.push(`항해 속도 +${Math.round(a.effects.sail! * 100)}%`);
  if (a.effects.nightImmune) out.push('밤 이동 감속 제거');
  if ((a.effects.baitDiscount ?? 0) > 0) {
    out.push(`미끼값 −${Math.round(a.effects.baitDiscount! * 100)}%`);
  }
  if (a.effects.variantRate !== undefined) {
    out.push(`변이 개체 확률 ${Math.round(a.effects.variantRate * 100)}%`);
  }
  return out;
}
