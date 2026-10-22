import { describe, expect, it } from 'vitest';
import { parseRecipients } from './mailDraft';

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
