import { TUTORIAL_IDS } from '../../../game/content/tutorials';
import type { TutorialId } from '../../../game/content/tutorials';

/** 지금 켜진 트리거 중 아직 보지 않은 튜토리얼 하나 — 여럿이면 튜토리얼 목록 순서를 따른다 */
export function pendingTutorial(active: readonly TutorialId[], seen: readonly string[]): TutorialId | null {
  return TUTORIAL_IDS.find(id => active.includes(id) && !seen.includes(id)) ?? null;
}
