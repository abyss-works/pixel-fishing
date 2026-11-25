import { boatNameOf } from '../../../game/content/boats';
import { TUTORIAL_IDS } from '../../../game/content/tutorials';
import type { TutorialId } from '../../../game/content/tutorials';
import { DEFAULT_LOOK } from '../../../game/content/wardrobe';
import { zoneById } from '../../../game/content/zones';

/** 튜토리얼 도해용 기본 캐릭터 외형 */
export const TUTORIAL_PLAYER_LOOK = DEFAULT_LOOK;

/** 튜토리얼 도해용 배 단계 라벨 */
export const TUTORIAL_BOAT_LABELS = {
  tier1: `${boatNameOf(1)}(1단계)`,
  tier2: `${boatNameOf(2)}(2단계)`,
} as const;

/** 튜토리얼 도해용 대표 바다 구역 이름 */
export const TUTORIAL_ZONE_NAMES = [
  zoneById('pacific')?.shortName ?? '태평양',
  zoneById('indian')?.shortName ?? '인도양',
  zoneById('southatlantic')?.shortName ?? '남대서양',
] as const;

/** 지금 켜진 트리거 중 아직 보지 않은 튜토리얼 하나 — 여럿이면 튜토리얼 목록 순서를 따른다 */
export function pendingTutorial(active: readonly TutorialId[], seen: readonly string[]): TutorialId | null {
  return TUTORIAL_IDS.find(id => active.includes(id) && !seen.includes(id)) ?? null;
}
