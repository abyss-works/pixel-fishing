// 보낸 우편 조회 보조 — 보낸 우편 검색 필터, 특정 계정의 답장 우편 내역 정렬, 읽음·수령 상태 판정을 제공한다.
import { adminIdentityLookup } from './adminViews';
import type { AdminSentMailRow, AdminUserRow } from './types';

export type SentMailStatus = '받음' | '읽음' | '안 읽음';

/** 보낸 우편의 수령·읽음 상태를 한글 라벨로 판정한다. */
export function sentMailStatus(mail: Pick<AdminSentMailRow, 'readAt' | 'claimedAt'>): SentMailStatus {
  if (mail.claimedAt) return '받음';
  if (mail.readAt) return '읽음';
  return '안 읽음';
}

/** 보낸 우편 목록을 제목, 본문, 받는 사람(닉네임, 이메일, 계정 id)의 대소문자 무시 부분 일치로 걸러낸다. */
export function filterSentMails(
  mails: readonly AdminSentMailRow[],
  users: readonly AdminUserRow[],
  query: string,
): AdminSentMailRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...mails];

  const identityOf = adminIdentityLookup(users);
  return mails.filter(mail => {
    const recipient = identityOf(mail.userId);
    return mail.title.toLowerCase().includes(needle)
      || mail.body.toLowerCase().includes(needle)
      || (recipient.nickname ?? '').toLowerCase().includes(needle)
      || (recipient.email ?? '').toLowerCase().includes(needle)
      || mail.userId.toLowerCase().includes(needle);
  });
}

/** 특정 계정 id에 보낸 우편을 발송 시각(createdAt) 내림차순으로 정렬해 반환한다. */
export function repliesForUser(
  mails: readonly AdminSentMailRow[],
  userId: string,
): AdminSentMailRow[] {
  const target = userId.toLowerCase();
  return mails
    .filter(mail => mail.userId.toLowerCase() === target)
    .sort((a, b) => {
      const ta = Date.parse(a.createdAt);
      const tb = Date.parse(b.createdAt);
      if (Number.isFinite(ta) && Number.isFinite(tb)) {
        if (tb !== ta) return tb - ta;
      } else {
        const cmp = b.createdAt.localeCompare(a.createdAt);
        if (cmp !== 0) return cmp;
      }
      return b.id - a.id;
    });
}
