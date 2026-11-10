import type { Bait } from '../../game/content/baits';
import { RARITY } from '../../game/content/rarity';
import { BAIT_WEIGHT_BONUS } from '../../game/rules/balance';

const bonusPercent = (): number => BAIT_WEIGHT_BONUS * 100;

/** 미끼 효과 문장 - 보너스 값은 밸런스 상수에서 뽑는다. 향료전, 가방 설명, 도움말이 같은 문장을 쓴다.
 *  subject는 효과를 받는 물고기 범위(예: "같은 등급", "희귀 등급")다. */
export function baitBoostText(subject: string): string {
  return `${subject} 가중치가 ${bonusPercent()}% 늘어요.`;
}

/** 특정 미끼의 효과 라벨 - 대상 등급 이름을 붙인다 */
export function baitEffectLine(bait: Bait): string {
  return `${RARITY[bait.targetRarity].name} 등급 가중치 +${bonusPercent()}%`;
}
