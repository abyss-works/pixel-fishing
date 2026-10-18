import type { Bait } from '../../game/content/baits';
import { RARITY } from '../../game/content/rarity';
import { BAIT_WEIGHT_MULT } from '../../game/rules/balance';

/** 미끼 효과 문장 — 배수는 밸런스 상수에서 뽑는다. 향료전·가방 설명·툴팁이 같은 문장을 쓴다.
 *  subject는 효과를 받는 물고기 범위(예: "같은 등급", "희귀 등급")다. */
export function baitBoostText(subject: string): string {
  return `${subject} 물고기가 걸리는 비중이 ${BAIT_WEIGHT_MULT}배가 돼요.`;
}

/** 특정 미끼의 효과 문장 — 대상 등급 이름을 붙인다 */
export function baitEffectLine(bait: Bait): string {
  return baitBoostText(`${RARITY[bait.targetRarity].name} 등급`);
}
