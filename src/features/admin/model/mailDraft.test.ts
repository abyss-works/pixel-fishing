import { describe, expect, it } from 'vitest';
import type { AdminUserRow } from './types';
import { addRecipient, parseRecipients, searchRecipients } from './mailDraft';

const A = '30e63c95-12de-4ba6-b397-e8b69ce0311c';
const B = 'e747e6c9-f0c2-4192-a462-9cd26e8a812a';

describe('받는 사람 입력', () => {
  it('공백·쉼표 구분과 골드 생략(0)을 읽고 빈 줄은 건너뛴다', () => {
    expect(parseRecipients(`${A} 6309483\n\n${B},100\n${A.toUpperCase()}`)).toEqual({
      recipients: [{ userId: A, gold: 6309483 }, { userId: B, gold: 100 }, { userId: A.toUpperCase(), gold: 0 }],
      badLines: [],
    });
  });

  it('형태가 틀린 줄 번호를 모은다', () => {
    expect(parseRecipients(`nope 1\n${A} -5\n${A} 1.5\n${A} 1 extra`).badLines).toEqual([1, 2, 3, 4]);
  });
});

describe('받는 사람 추가', () => {
  it('빈 입력에는 그 계정을 골드 0으로 넣는다', () => {
    expect(addRecipient('', A)).toBe(`${A} 0`);
  });

  it('기존 줄 뒤에 새 줄로 붙이고, 끝의 빈 줄은 정리한다', () => {
    expect(addRecipient(`${B} 100\n\n`, A)).toBe(`${B} 100\n${A} 0`);
  });

  it('이미 들어 있는 계정은 대소문자와 관계없이 다시 넣지 않는다', () => {
    const text = `${A.toUpperCase()} 500`;
    expect(addRecipient(text, A)).toBe(text);
  });
});

describe('받는 사람 검색', () => {
  const row = (user_id: string, email: string | null, nickname: string | null) =>
    ({ user_id, email, nickname }) as AdminUserRow;
  const users = [
    row(A, 'angler@example.test', '바다낚시꾼'),
    row(B, null, '민물러'),
    ...Array.from({ length: 12 }, (_, i) => row(`u-${i}`, `friend${i}@example.test`, null)),
  ];

  it('빈 검색어는 아무도 찾지 않는다', () => {
    expect(searchRecipients(users, '  ')).toEqual([]);
  });

  it('이메일과 닉네임의 부분 일치로 찾는다', () => {
    expect(searchRecipients(users, 'ANGLER').map(u => u.user_id)).toEqual([A]);
    expect(searchRecipients(users, '낚시').map(u => u.user_id)).toEqual([A]);
    expect(searchRecipients(users, '민물').map(u => u.user_id)).toEqual([B]);
  });

  it('결과는 8명까지만 보인다', () => {
    expect(searchRecipients(users, 'friend')).toHaveLength(8);
  });
});
