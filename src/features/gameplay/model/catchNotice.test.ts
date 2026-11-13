import { describe, expect, it } from 'vitest';
import { bagOverflowNotice } from './catchNotice';

const fish = (uid: string, name: string) => ({ uid, name });

describe('가방 초과 안내', () => {
  it('내보낸 개체가 없으면 안내가 없다', () => {
    expect(bagOverflowNotice({ released: [] })).toBeNull();
    expect(bagOverflowNotice({ released: [], extracted: [] })).toBeNull();
  });

  it('놓아주기만 있으면 기존 문구 그대로다', () => {
    expect(bagOverflowNotice({ released: [fish('a', '붕어'), fish('b', '잉어')] }))
      .toBe('가방이 가득 차 [붕어, 잉어]을(를) 놓아줬어요. 명성은 그대로 남아요.');
  });

  it('기운으로 바꾸기만 있으면 바꾼 수를 알린다', () => {
    expect(bagOverflowNotice({ released: [], extracted: [fish('a', '붕어')] }))
      .toBe('가방이 차서 1마리를 생명의 기운으로 바꿨어요.');
  });

  it('둘 다 있으면 한 문장으로 알린다', () => {
    expect(bagOverflowNotice({ released: [fish('b', '잉어')], extracted: [fish('a', '붕어'), fish('c', '피라미')] }))
      .toBe('가방이 차서 2마리를 생명의 기운으로 바꾸고 1마리를 놓아줬어요.');
  });
});
