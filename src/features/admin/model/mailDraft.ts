// 관리자 우편 작성 — 받는 사람 입력을 보내기 요청의 대상으로 읽는다.
// 한 줄에 한 사람이고 "계정 id 골드"(공백 또는 쉼표 구분)다. 골드를 생략하면 0이다. 빈 줄은 건너뛴다.
// 검색으로 고른 계정도 같은 입력에 한 줄로 더해진다.
import type { MailItemAttachment } from '../../../platform/api';
import {
  STACKABLE_ITEMS,
  STACKABLE_ITEM_KIND_LABEL,
  findStackableItem,
  formatItemQtyText,
  maxAttachableQty,
  type StackableItem,
} from '../../inventory/model/items';
import { filterAdminUsers } from './adminViews';
import type { AdminUserRow } from './types';

export { STACKABLE_ITEM_KIND_LABEL, findStackableItem, formatItemQtyText };
export type { MailItemAttachment };

/** 한 번의 우편 보내기로 지급할 수 있는 총 골드 상한 */
export const MAX_MAIL_BATCH_TOTAL_GOLD = 500_000_000;

export interface RecipientParse {
  recipients: { userId: string; gold: number }[];
  /** 형태가 틀린 줄 번호(1부터) */
  badLines: number[];
  /** 중복 입력된 계정 id 목록(소문자 정규화) */
  duplicates: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRecipients(text: string): RecipientParse {
  const recipients: RecipientParse['recipients'] = [];
  const badLines: number[] = [];
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const dupSet = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const [userId, goldText, ...rest] = line.split(/[\s,]+/);
    const gold = goldText === undefined ? 0 : Number(goldText);
    if (rest.length > 0 || !UUID.test(userId) || !Number.isSafeInteger(gold) || gold < 0) {
      badLines.push(i + 1);
      return;
    }
    const norm = userId.toLowerCase();
    if (seen.has(norm)) {
      if (!dupSet.has(norm)) {
        dupSet.add(norm);
        duplicates.push(norm);
      }
    } else {
      seen.add(norm);
    }
    recipients.push({ userId, gold });
  });
  return { recipients, badLines, duplicates };
}

/** 받는 사람 입력에 계정 하나를 골드 0인 줄로 더한다. 이미 있는 계정이면 입력을 그대로 둔다 */
export function addRecipient(text: string, userId: string): string {
  const id = userId.toLowerCase();
  const present = text.split(/\r?\n/).some(line => line.trim().split(/[\s,]+/)[0].toLowerCase() === id);
  if (present) return text;
  const kept = text.trimEnd();
  return kept ? `${kept}\n${userId} 0` : `${userId} 0`;
}

/** 받는 사람 검색 결과의 최대 수 */
const SEARCH_LIMIT = 8;

/** 이메일·닉네임·계정 id의 부분 일치로 받는 사람 후보를 찾는다. 빈 검색어는 아무도 찾지 않는다 */
export function searchRecipients(users: readonly AdminUserRow[], query: string): AdminUserRow[] {
  if (!query.trim()) return [];
  return filterAdminUsers(users, query).slice(0, SEARCH_LIMIT);
}

/** 아이템 검색 결과의 최대 수 */
const ITEM_SEARCH_LIMIT = 10;

/** 이름·종류·id의 부분 일치로 첨부 가능한 아이템을 찾는다. 빈 검색어는 아무것도 찾지 않는다 */
export function searchAttachableItems(query: string): StackableItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return STACKABLE_ITEMS.filter(item => {
    if (!item.attachable) return false;
    const kindLabel = STACKABLE_ITEM_KIND_LABEL[item.kind].toLowerCase();
    return item.name.toLowerCase().includes(needle)
      || item.id.toLowerCase().includes(needle)
      || kindLabel.includes(needle);
  }).slice(0, ITEM_SEARCH_LIMIT);
}

/** 첨부 목록에 아이템을 넣거나 수량을 바꾼다. 잘못된 아이템·수량이면 오류 문구를 돌려준다 */
export function upsertMailAttachment(
  list: readonly MailItemAttachment[],
  id: string,
  qty: number,
): { items: MailItemAttachment[]; error: string | null } {
  const item = findStackableItem(id);
  if (!item || !item.attachable) {
    return { items: [...list], error: '첨부할 수 없는 아이템이에요.' };
  }
  const cap = maxAttachableQty(id);
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > cap) {
    return { items: [...list], error: `수량은 1~${cap.toLocaleString('ko-KR')} 사이 정수여야 해요.` };
  }
  const exists = list.some(entry => entry.id === id);
  const items = exists
    ? list.map(entry => (entry.id === id ? { id, qty } : entry))
    : [...list, { id, qty }];
  return { items, error: null };
}

/** 첨부 목록에서 특정 아이템을 뺀다 */
export function removeMailAttachment(
  list: readonly MailItemAttachment[],
  id: string,
): MailItemAttachment[] {
  return list.filter(entry => entry.id !== id);
}

/** 첨부 아이템 목록 요약 문구 */
export function formatMailItemsSummary(items: readonly MailItemAttachment[]): string {
  return items.map(att => formatItemQtyText(att.id, att.qty)).join(', ');
}

/** 미리보기·보내기에서 서버가 돌려준 형태 문제를 안내 문장으로 바꾼다 */
export const MAIL_PROBLEM_TEXT: Record<string, string> = {
  title: '제목은 1~60자여야 해요.',
  body: '본문은 1~2,000자여야 해요.',
  gold: '골드는 0 이상 10억 이하의 정수여야 해요.',
  items: '첨부 아이템 종류나 수량(상한 초과 포함)이 올바르지 않아요.',
  empty: '골드나 아이템 중 하나 이상을 보내야 해요.',
  recipients: '받는 사람이 없거나 계정 id 형식이 틀렸어요.',
  duplicate: '같은 계정이 두 번 이상 들어 있어요.',
  totalGold: '총 지급 골드가 일괄 발송 상한(5억 G)을 초과했어요.',
};
