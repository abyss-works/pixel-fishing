// 관리자 우편 작성 — 받는 사람 입력을 보내기 요청의 대상으로 읽는다.
// 한 줄에 한 사람이고 "계정 id 골드"(공백 또는 쉼표 구분)다. 골드를 생략하면 0이다. 빈 줄은 건너뛴다.
// 검색으로 고른 계정도 같은 입력에 한 줄로 더해진다.
import { filterAdminUsers } from './adminViews';
import type { AdminUserRow } from './types';

export interface RecipientParse {
  recipients: { userId: string; gold: number }[];
  /** 형태가 틀린 줄 번호(1부터) */
  badLines: number[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRecipients(text: string): RecipientParse {
  const recipients: RecipientParse['recipients'] = [];
  const badLines: number[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const [userId, goldText, ...rest] = line.split(/[\s,]+/);
    const gold = goldText === undefined ? 0 : Number(goldText);
    if (rest.length > 0 || !UUID.test(userId) || !Number.isSafeInteger(gold) || gold < 0) {
      badLines.push(i + 1);
      return;
    }
    recipients.push({ userId, gold });
  });
  return { recipients, badLines };
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

/** 미리보기·보내기에서 서버가 돌려준 형태 문제를 안내 문장으로 바꾼다 */
export const MAIL_PROBLEM_TEXT: Record<string, string> = {
  title: '제목은 1~60자여야 해요.',
  body: '본문은 1~2,000자여야 해요.',
  gold: '골드는 0 이상 10억 이하의 정수여야 해요.',
  recipients: '받는 사람이 없거나 계정 id 형식이 틀렸어요.',
  duplicate: '같은 계정이 두 번 들어 있어요.',
};
