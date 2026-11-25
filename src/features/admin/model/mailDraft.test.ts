import { describe, expect, it } from 'vitest';
import type { AdminUserRow } from './types';
import {
  MAIL_PROBLEM_TEXT,
  addRecipient,
  parseRecipients,
  removeMailAttachment,
  searchAttachableItems,
  searchRecipients,
  upsertMailAttachment,
} from './mailDraft';

const A = '30e63c95-12de-4ba6-b397-e8b69ce0311c';
const B = 'e747e6c9-f0c2-4192-a462-9cd26e8a812a';

describe('받는 사람 입력', () => {
  it('공백·쉼표 구분과 골드 생략(0)을 읽고 빈 줄과 중복 계정을 기록한다', () => {
    expect(parseRecipients(`${A} 6309483\n\n${B},100`)).toEqual({
      recipients: [{ userId: A, gold: 6309483 }, { userId: B, gold: 100 }],
      badLines: [],
      duplicates: [],
    });
    expect(parseRecipients(`${A} 6309483\n\n${B},100\n${A.toUpperCase()}`)).toEqual({
      recipients: [{ userId: A, gold: 6309483 }, { userId: B, gold: 100 }, { userId: A.toUpperCase(), gold: 0 }],
      badLines: [],
      duplicates: [A],
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

describe('첨부 아이템 검색과 편집', () => {
  it('빈 검색어는 아무것도 찾지 않고, 종류나 이름으로 찾는다', () => {
    expect(searchAttachableItems('   ')).toEqual([]);
    expect(searchAttachableItems('물약').map(i => i.id)).toContain('luck-small');
    expect(searchAttachableItems('기운').map(i => i.kind)).toContain('energy');
  });

  it('유효한 수량만 첨부 목록에 추가하거나 갱신하고 상한 초과를 막는다', () => {
    const first = upsertMailAttachment([], 'luck-small', 2);
    expect(first).toEqual({ items: [{ id: 'luck-small', qty: 2 }], error: null });

    const updated = upsertMailAttachment(first.items, 'luck-small', 5);
    expect(updated).toEqual({ items: [{ id: 'luck-small', qty: 5 }], error: null });

    const invalidQty = upsertMailAttachment(updated.items, 'luck-small', 0);
    expect(invalidQty.error).toBeTruthy();

    // 생명의 기운은 1개 = 저장 단위 10이라 100,001개는 ITEM_CAP(1,000,000) 초과다
    const overEnergyCap = upsertMailAttachment([], 'energy-common', 100_001);
    expect(overEnergyCap.error).toContain('100,000');

    expect(removeMailAttachment(updated.items, 'luck-small')).toEqual([]);
  });

  it('items와 empty 문제 문구를 제공한다', () => {
    expect(MAIL_PROBLEM_TEXT.items).toBeTruthy();
    expect(MAIL_PROBLEM_TEXT.empty).toBeTruthy();
  });
});
