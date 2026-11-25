// 메뉴 카드 잠금 - 잠금 사유 선택과 툴팁 문안의 단일 출처. 카드의 모양과 툴팁 열기는 표현 계층이 정한다.
import { BOATS, boatGateText } from '../../../game/content/boats';
import { COOKING_UNLOCK_BOAT } from '../../../game/content/cooking';
import { ZONES, zoneById } from '../../../game/content/zones';
import type { GameAction } from '../../../game/rules/actions';
import { cookingUnlocked } from '../../../game/rules/cooking';
import { REJECT_TEXT } from '../../../game/rules/rules';
import { guestActionVerdict } from '../../../game/rules/guest';
import type { FurnitureId } from '../../../game/world';
import { josa } from '../../../shared/lib/josa';
import type { MenuKey } from './menuEntries';

/** 잠금 판정에 쓰는 계정 상태. 확인 실패(unverified)는 게스트가 아니며 확인 실패 전용 문안으로 잠근다 */
export type AccountLockState = 'account' | 'guest' | 'unverified';

export type MenuLock =
  | { kind: 'none' }
  | { kind: 'guest'; lines: string[] }
  | { kind: 'unverified'; lines: string[] }
  | { kind: 'progress'; lines: string[] };

const PACIFIC_LANE = `${zoneById('pacific')?.shortName ?? '태평양'} 항로`;

export const GUEST_LOCK_TEXT = `${PACIFIC_LANE}${josa(PACIFIC_LANE, '이/가')} 열리면 쓸 수 있어요.`;
export const GUEST_LOCK_NOTE = `${PACIFIC_LANE}${josa(PACIFIC_LANE, '은/는')} ${boatGateText(1)}부터 열려요.`;
export const GUEST_LOCK_DEFAULT_LINES: readonly string[] = [GUEST_LOCK_TEXT, GUEST_LOCK_NOTE];
export const UNVERIFIED_LOCK_TEXT = '계정을 확인하면 쓸 수 있어요.';

/** 게스트에게 닫힌 화면 기능. 메뉴 줄 넷과 채팅, 편지, 닉네임 변경, 플레이어 정보의 친구 요청과 차단, 차단 목록이다 */
export type GuestFeature = MenuKey | 'chat' | 'letter' | 'nickname' | 'player';

// 게스트 규칙의 액션으로 판정되는 기능. 규칙 판정은 게스트 규칙 모듈이 하고 여기는 짝만 안다.
const GUEST_FEATURE_ACTION: Partial<Record<GuestFeature, GameAction>> = {
  quests: { type: 'acceptQuest', questId: '', port: '' },
  achievements: { type: 'claimAllAchievements' },
  mailbox: { type: 'claimMail', id: 0 },
  letter: { type: 'sendLetter', text: '' },
  nickname: { type: 'setNickname', nickname: '' },
};

// 게스트 규칙(guestActionVerdict)은 게임 액션만 판정한다. 길드, 친구, 채팅 쓰기, 플레이어 정보의 친구 요청과 차단은
// 게임 액션이 아니라 서버 API 함수라 대응 액션이 없고, 서버가 각 함수에서 세션의 이메일이 없으면(게스트) 거부한다.
// 그래서 지금은 이 클라이언트 목록이 필요하다. 서버가 이 거부를 규칙 모듈의 판정으로 옮기면 이 목록을 규칙 판정으로 바꾼다.
const GUEST_CLOSED_FEATURES: ReadonlySet<GuestFeature> = new Set(['guild', 'friends', 'chat', 'player']);

// 첫 줄에 기능 이름을 더해야 하는 기능의 잠금 문안. 둘째 줄은 공통 항로 안내를 따른다.
const GUEST_LOCK_LINES: Partial<Record<GuestFeature, readonly string[]>> = {
  chat: [`채팅은 ${GUEST_LOCK_TEXT}`, GUEST_LOCK_NOTE],
  letter: [`편지는 ${GUEST_LOCK_TEXT}`, GUEST_LOCK_NOTE],
};

/** 서버가 채팅 쓰기를 거부했을 때 메시지 창 한 줄로 보이는 안내 */
export const GUEST_CHAT_NOTICE = `채팅은 ${GUEST_LOCK_TEXT}`;

/**
 * 계정 상태에 따라 닫힌 화면 기능의 잠금 툴팁 줄. 계정이 확인됐거나 그 기능이 계정 없이 열려 있으면 null이다.
 * 확인 실패 상태에서는 확인 실패 전용 문안을, 게스트 상태에서는 게스트 잠금 문안을 돌려준다.
 */
export function guestLock(feature: GuestFeature, account: AccountLockState): readonly string[] | null {
  if (account === 'account') return null;
  const action = GUEST_FEATURE_ACTION[feature];
  const closed = action ? guestActionVerdict(action) !== 'ok' : GUEST_CLOSED_FEATURES.has(feature);
  if (!closed) return null;
  if (account === 'unverified') return [UNVERIFIED_LOCK_TEXT];
  return GUEST_LOCK_LINES[feature] ?? GUEST_LOCK_DEFAULT_LINES;
}

/** 진행 조건 문안 - 줄마다 따로 보인다. 구역에 들어서는 배 단계면 그 구역의 항로를 먼저 쓰고,
 *  구역 진입 단계가 아니면 배 단계로만 쓴다. 기능 이름이 문장의 목적어(기본, 잠금 툴팁)인지
 *  주제(topic, 기능을 먼저 소개하는 안내)인지에 따라 첫 줄의 어순만 다르다 */
export function progressLines(feature: string, boat: number, form: 'object' | 'topic' = 'object'): string[] {
  return progressSentences(boat, condition => form === 'topic'
    ? `${feature}${josa(feature, '은/는')} ${condition} 쓸 수 있어요.`
    : `${condition} ${feature}${josa(feature, '을/를')} 쓸 수 있어요.`);
}

/** 진행 조건 뒤에 호출부가 쓴 서술부를 붙인 첫 줄과, 구역 항로 조건이면 그 항로가 열리는 배 단계 줄 */
export function progressNote(boat: number, predicate: string): string[] {
  return progressSentences(boat, condition => `${condition} ${predicate}`);
}

function progressSentences(boat: number, sentence: (condition: string) => string): string[] {
  const zone = ZONES.find(z => z.entryBoat === boat);
  const boatRow = BOATS.find(b => b.tier === boat);
  const boatText = boatRow ? `${boatRow.name}(${boat}단계)` : `${boat}단계`;
  if (!zone) return [sentence(`${boatText}${josa(boatText, '이/가')} 되면`)];
  const lane = `${zone.shortName} 항로`;
  return [
    sentence(`${lane}${josa(lane, '이/가')} 열리면`),
    `${lane}${josa(lane, '은/는')} ${boatText}부터 열려요.`,
  ];
}

/**
 * 잠금 사유를 고른다. 계정을 연결하거나 확인하지 않으면 진행 조건을 채워도 쓸 수 없으므로 계정 상태 잠금(게스트 또는 확인 실패)이 먼저다.
 * progress.boat는 기능이 열리는 배 단계이고, 그 단계에 들어서는 구역 이름으로 문안을 만든다.
 */
export function menuLock(input: {
  account: AccountLockState;
  guestAllowed: boolean;
  feature: string;
  progress?: { met: boolean; boat: number };
}): MenuLock {
  if (input.account !== 'account' && !input.guestAllowed) {
    return input.account === 'unverified'
      ? { kind: 'unverified', lines: [UNVERIFIED_LOCK_TEXT] }
      : { kind: 'guest', lines: [...GUEST_LOCK_DEFAULT_LINES] };
  }
  if (input.progress && !input.progress.met) {
    return { kind: 'progress', lines: progressLines(input.feature, input.progress.boat) };
  }
  return { kind: 'none' };
}

// 거점 카드가 여는 기능을 게스트 규칙에 비춰 보는 대표 액션. 규칙 판정은 게스트 규칙 모듈이 하고 여기는 짝만 안다.
// 짝이 없는 카드(랭킹, 수배판, 마을행, 문, 승선)는 이 판정을 쓰지 않는다.
const GUEST_ACTION_OF: Partial<Record<FurnitureId, GameAction>> = {
  rod: { type: 'upgradeRod' },
  boat: { type: 'buyBoat' },
  sell: { type: 'sell', uids: [] },
  wardrobe: { type: 'changeClothes', shirt: 0, pants: 0 },
  kitchen: { type: 'cook', recipe: '', count: 1 },
  ferry: { type: 'travel', to: { kind: 'region', id: 'world' } },
};

/** 게스트가 그 카드의 기능을 쓸 수 있는가. 짝이 없는 카드는 게스트 규칙으로 잠그지 않는다 */
export function facilityGuestAllowed(id: FurnitureId): boolean {
  const action = GUEST_ACTION_OF[id];
  return !action || guestActionVerdict(action) === 'ok';
}

/** 카드가 배 단계로 열리는 기능이면 그 조건. 없으면 진행 조건으로 잠그지 않는다 */
export function facilityProgress(id: FurnitureId, boat: number): { met: boolean; boat: number } | undefined {
  if (id === 'kitchen') return { met: cookingUnlocked(boat), boat: COOKING_UNLOCK_BOAT };
  if (id === 'ferry') return { met: boat >= 1, boat: 1 };
  return undefined;
}

/** 판매 창의 기운 얻기 탭 잠금. 잠금 순서는 menuLock이 정하고(계정 상태 잠금이 먼저), 해금 전 첫 줄은 규칙의 거부 문구와 같은 문장이다.
 *  판정은 게스트 규칙과 요리 해금 규칙이 하고 여기는 문안을 만든다 */
export function energyTabLock(account: AccountLockState, boat: number): MenuLock {
  const lock = menuLock({
    account,
    guestAllowed: guestActionVerdict({ type: 'extractEnergy', uids: [] }) === 'ok',
    feature: '기운 얻기',
    progress: { met: cookingUnlocked(boat), boat: COOKING_UNLOCK_BOAT },
  });
  if (lock.kind !== 'progress') return lock;
  return { kind: 'progress', lines: [REJECT_TEXT['energy-locked'], ...lock.lines.slice(1)] };
}
