// 메뉴 카드 잠금 - 잠금 사유 선택과 툴팁 문안의 단일 출처. 카드의 모양과 툴팁 열기는 표현 계층이 정한다.
import { BOATS } from '../../../game/content/boats';
import { COOKING_UNLOCK_BOAT } from '../../../game/content/cooking';
import { ZONES } from '../../../game/content/zones';
import type { GameAction } from '../../../game/rules/actions';
import { guestActionVerdict } from '../../../game/rules/guest';
import type { FurnitureId } from '../../../game/world';
import { josa } from '../../../shared/lib/josa';

export type MenuLock =
  | { kind: 'none' }
  | { kind: 'guest'; lines: string[] }
  | { kind: 'progress'; lines: string[] };

export const GUEST_LOCK_TEXT = '계정을 연결하면 쓸 수 있어요.';

/** 진행 조건 잠금 문안 - 줄마다 따로 보인다. 구역에 들어서는 배 단계면 그 구역의 항로를 먼저 쓰고,
 *  구역 진입 단계가 아니면 배 단계로만 쓴다 */
function progressLines(feature: string, boat: number): string[] {
  const zone = ZONES.find(z => z.entryBoat === boat);
  const boatRow = BOATS.find(b => b.tier === boat);
  const boatText = boatRow ? `${boatRow.name}(${boat}단계)` : `${boat}단계`;
  const use = `${feature}${josa(feature, '을/를')} 쓸 수 있어요.`;
  if (!zone) return [`${boatText}${josa(boatText, '이/가')} 되면 ${use}`];
  const lane = `${zone.shortName} 항로`;
  return [
    `${lane}${josa(lane, '이/가')} 열리면 ${use}`,
    `${lane}${josa(lane, '은/는')} ${boatText}부터 열려요.`,
  ];
}

/**
 * 잠금 사유를 고른다. 계정을 연결하지 않으면 진행 조건을 채워도 쓸 수 없으므로 게스트 잠금이 먼저다.
 * progress.boat는 기능이 열리는 배 단계이고, 그 단계에 들어서는 구역 이름으로 문안을 만든다.
 */
export function menuLock(input: {
  guest: boolean;
  guestAllowed: boolean;
  feature: string;
  progress?: { met: boolean; boat: number };
}): MenuLock {
  if (input.guest && !input.guestAllowed) return { kind: 'guest', lines: [GUEST_LOCK_TEXT] };
  if (input.progress && !input.progress.met) {
    return { kind: 'progress', lines: progressLines(input.feature, input.progress.boat) };
  }
  return { kind: 'none' };
}

// 거점 카드가 여는 기능을 게스트 규칙에 비춰 보는 대표 액션. 규칙 판정은 게스트 규칙 모듈이 하고 여기는 짝만 안다.
// 짝이 없는 카드(랭킹, 수배판, 미끼 상점, 이동 구역)는 이 판정을 쓰지 않는다.
const GUEST_ACTION_OF: Partial<Record<FurnitureId, GameAction>> = {
  rod: { type: 'upgradeRod' },
  boat: { type: 'buyBoat' },
  sell: { type: 'sell', uids: [] },
  wardrobe: { type: 'changeClothes', shirt: 0, pants: 0 },
};

// 부엌은 요리 액션이 아직 없어 대표 액션을 못 짝지운다. 게스트 규칙은 열어 둔 액션 외에는 모두 계정 전용이고
// 요리 액션은 열어 둔 목록에 없으므로 부엌은 게스트에게 닫는다. 요리 액션이 생기면 위 표의 짝으로 옮긴다.
const GUEST_CLOSED: ReadonlySet<FurnitureId> = new Set(['kitchen']);

/** 게스트가 그 카드의 기능을 쓸 수 있는가. 짝이 없는 카드는 게스트 규칙으로 잠그지 않는다 */
export function facilityGuestAllowed(id: FurnitureId): boolean {
  if (GUEST_CLOSED.has(id)) return false;
  const action = GUEST_ACTION_OF[id];
  return !action || guestActionVerdict(action) === 'ok';
}

/** 카드가 배 단계로 열리는 기능이면 그 조건. 없으면 진행 조건으로 잠그지 않는다 */
export function facilityProgress(id: FurnitureId, boat: number): { met: boolean; boat: number } | undefined {
  if (id === 'kitchen') return { met: boat >= COOKING_UNLOCK_BOAT, boat: COOKING_UNLOCK_BOAT };
  return undefined;
}
