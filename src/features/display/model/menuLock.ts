// 메뉴 카드 잠금 - 잠금 사유 선택과 툴팁 문안의 단일 출처. 카드의 모양과 툴팁 열기는 표현 계층이 정한다.
import { BOATS } from '../../../game/content/boats';
import { COOKING_UNLOCK_BOAT } from '../../../game/content/cooking';
import { ZONES } from '../../../game/content/zones';
import type { GameAction } from '../../../game/rules/actions';
import { cookingUnlocked } from '../../../game/rules/cooking';
import { guestActionVerdict } from '../../../game/rules/guest';
import type { FurnitureId } from '../../../game/world';
import { josa } from '../../../shared/lib/josa';
import type { MenuKey } from './menuEntries';

export type MenuLock =
  | { kind: 'none' }
  | { kind: 'guest'; lines: string[] }
  | { kind: 'progress'; lines: string[] };

export const GUEST_LOCK_TEXT = '계정을 연결하면 쓸 수 있어요.';

/** 게스트에게 닫힌 화면 기능. 메뉴 줄 넷과 채팅, 편지, 닉네임 변경, 플레이어 정보의 친구 요청과 차단, 차단 목록이다 */
export type GuestFeature = MenuKey | 'chat' | 'letter' | 'nickname' | 'player';

// 게스트 규칙의 액션으로 판정되는 기능. 규칙 판정은 게스트 규칙 모듈이 하고 여기는 짝만 안다.
const GUEST_FEATURE_ACTION: Partial<Record<GuestFeature, GameAction>> = {
  quests: { type: 'acceptQuest', questId: '', port: '' },
  mailbox: { type: 'claimMail', id: 0 },
  letter: { type: 'sendLetter', text: '' },
  nickname: { type: 'setNickname', nickname: '' },
};

// 게스트 규칙(guestActionVerdict)은 게임 액션만 판정한다. 길드, 친구, 채팅 쓰기, 플레이어 정보의 친구 요청과 차단은
// 게임 액션이 아니라 서버 API 함수라 대응 액션이 없고, 서버가 각 함수에서 세션의 이메일이 없으면(게스트) 거부한다.
// 그래서 지금은 이 클라이언트 목록이 필요하다. 서버가 이 거부를 규칙 모듈의 판정으로 옮기면 이 목록을 규칙 판정으로 바꾼다.
const GUEST_CLOSED_FEATURES: ReadonlySet<GuestFeature> = new Set(['guild', 'friends', 'chat', 'player']);

// 기능 이름과 이유를 더해야 하는 기능의 잠금 문안. 나머지는 공통 한 줄이다.
const GUEST_LOCK_LINES: Partial<Record<GuestFeature, readonly string[]>> = {
  chat: ['채팅은 계정을 연결하면 쓸 수 있어요.', '계정 관리에서 계정을 연결해 주세요.'],
  letter: ['편지는 계정을 연결하면 쓸 수 있어요.', '답장을 계정 이메일로 드리기 때문이에요.'],
};

/** 서버가 채팅 쓰기를 거부했을 때 메시지 창 한 줄로 보이는 안내 */
export const GUEST_CHAT_NOTICE = GUEST_LOCK_LINES.chat!.join(' ');

/**
 * 게스트에게 닫힌 화면 기능의 잠금 툴팁 줄. 게스트가 아니거나 그 기능이 게스트에게 열려 있으면 null이다.
 * 어떤 기능이 닫히는지는 게스트 규칙 판정과 계정 전용 목록이 정하고, 표현 계층은 이 결과만 쓴다.
 */
export function guestLock(feature: GuestFeature, guest: boolean): readonly string[] | null {
  if (!guest) return null;
  const action = GUEST_FEATURE_ACTION[feature];
  const closed = action ? guestActionVerdict(action) !== 'ok' : GUEST_CLOSED_FEATURES.has(feature);
  return closed ? GUEST_LOCK_LINES[feature] ?? [GUEST_LOCK_TEXT] : null;
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
  kitchen: { type: 'cook', recipe: '', count: 1 },
};

/** 게스트가 그 카드의 기능을 쓸 수 있는가. 짝이 없는 카드는 게스트 규칙으로 잠그지 않는다 */
export function facilityGuestAllowed(id: FurnitureId): boolean {
  const action = GUEST_ACTION_OF[id];
  return !action || guestActionVerdict(action) === 'ok';
}

/** 카드가 배 단계로 열리는 기능이면 그 조건. 없으면 진행 조건으로 잠그지 않는다 */
export function facilityProgress(id: FurnitureId, boat: number): { met: boolean; boat: number } | undefined {
  if (id === 'kitchen') return { met: cookingUnlocked(boat), boat: COOKING_UNLOCK_BOAT };
  return undefined;
}
