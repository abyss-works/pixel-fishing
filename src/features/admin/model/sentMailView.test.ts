import { describe, expect, it } from 'vitest';
import type { AdminSentMailRow, AdminUserRow } from './types';
import { filterSentMails, repliesForUser, sentMailStatus } from './sentMailView';

const USER_A = '30e63c95-12de-4ba6-b397-e8b69ce0311c';
const USER_B = 'e747e6c9-f0c2-4192-a462-9cd26e8a812a';
const USER_UNKNOWN = 'ffffffff-0000-0000-0000-000000000000';

const makeUser = (user_id: string, email: string | null, nickname: string | null): AdminUserRow =>
  ({ user_id, email, nickname, is_anonymous: email === null }) as AdminUserRow;

const makeMail = (overrides: Partial<AdminSentMailRow> & { id: number; userId: string }): AdminSentMailRow => ({
  title: '기본 제목',
  body: '기본 본문',
  gold: 0,
  items: [],
  createdAt: '2026-10-20T00:00:00Z',
  readAt: null,
  claimedAt: null,
  ...overrides,
});

const users: AdminUserRow[] = [
  makeUser(USER_A, 'Friend@Example.com', '바다친구'),
  makeUser(USER_B, null, '민물러'),
];

const mails: AdminSentMailRow[] = [
  makeMail({ id: 1, userId: USER_A, title: '점검 보상', body: '서버 점검 사과 골드예요.', gold: 500, createdAt: '2026-10-20T01:00:00Z' }),
  makeMail({ id: 2, userId: USER_B, title: '비약 지급', body: '행운의 비약을 보내드려요.', createdAt: '2026-10-21T02:00:00Z' }),
  makeMail({ id: 3, userId: USER_A.toUpperCase(), title: '답장 안내', body: '편지 감사합니다!', createdAt: '2026-10-22T03:00:00Z', readAt: '2026-10-22T04:00:00Z' }),
  makeMail({ id: 4, userId: USER_UNKNOWN, title: '탈퇴 전 안내', body: 'HELLO world', createdAt: '2026-10-19T00:00:00Z' }),
];

describe('filterSentMails', () => {
  it('검색어가 비어 있거나 공백만 있으면 원본 순서대로 모든 우편을 반환한다', () => {
    const all = filterSentMails(mails, users, '');
    expect(all.map(m => m.id)).toEqual([1, 2, 3, 4]);
    expect(all).not.toBe(mails);

    expect(filterSentMails(mails, users, '   \t  ').map(m => m.id)).toEqual([1, 2, 3, 4]);
  });

  it('앞뒤 공백을 제거하고 제목과 본문의 대소문자 무시 부분 일치로 걸러낸다', () => {
    expect(filterSentMails(mails, users, '  비약  ').map(m => m.id)).toEqual([2]);
    expect(filterSentMails(mails, users, '점검 사과').map(m => m.id)).toEqual([1]);
    expect(filterSentMails(mails, users, 'hello').map(m => m.id)).toEqual([4]);
  });

  it('받는 사람 닉네임, 이메일, user_id의 대소문자 무시 부분 일치로 걸러낸다', () => {
    expect(filterSentMails(mails, users, '바다친구').map(m => m.id)).toEqual([1, 3]);
    expect(filterSentMails(mails, users, 'friend@example').map(m => m.id)).toEqual([1, 3]);
    expect(filterSentMails(mails, users, '민물').map(m => m.id)).toEqual([2]);
    expect(filterSentMails(mails, users, '30E63C95').map(m => m.id)).toEqual([1, 3]);
    expect(filterSentMails(mails, users, 'ffffffff-0000').map(m => m.id)).toEqual([4]);
  });

  it('일치하는 우편이 없으면 빈 배열을 반환한다', () => {
    expect(filterSentMails(mails, users, '없는검색어')).toEqual([]);
  });
});

describe('repliesForUser', () => {
  it('대소문자 무시로 해당 유저의 우편만 골라 createdAt 내림차순으로 반환한다', () => {
    const result = repliesForUser(mails, USER_A);
    expect(result.map(m => m.id)).toEqual([3, 1]);
  });

  it('createdAt이 같으면 id 내림차순으로 정렬하고 원본 배열을 변경하지 않는다', () => {
    const sameTime: AdminSentMailRow[] = [
      makeMail({ id: 10, userId: USER_B, title: '첫 번째', createdAt: '2026-10-25T10:00:00Z' }),
      makeMail({ id: 12, userId: USER_B, title: '세 번째', createdAt: '2026-10-25T10:00:00Z' }),
      makeMail({ id: 11, userId: USER_B, title: '두 번째', createdAt: '2026-10-26T10:00:00Z' }),
    ];
    const snapshot = sameTime.map(m => m.id);
    expect(repliesForUser(sameTime, USER_B.toUpperCase()).map(m => m.id)).toEqual([11, 12, 10]);
    expect(sameTime.map(m => m.id)).toEqual(snapshot);
  });

  it('해당 유저에게 보낸 우편이 없으면 빈 배열을 반환한다', () => {
    expect(repliesForUser(mails, '00000000-0000-0000-0000-000000000000')).toEqual([]);
  });
});

describe('sentMailStatus', () => {
  it('수령, 읽음, 안 읽음 상태를 순서대로 판정한다', () => {
    expect(sentMailStatus({ readAt: '2026-10-22T00:00:00Z', claimedAt: '2026-10-22T01:00:00Z' })).toBe('받음');
    expect(sentMailStatus({ readAt: '2026-10-22T00:00:00Z', claimedAt: null })).toBe('읽음');
    expect(sentMailStatus({ readAt: null, claimedAt: null })).toBe('안 읽음');
  });
});
