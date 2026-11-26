import { describe, expect, it } from 'vitest';
import { splitTipLines } from './tipText';

describe('splitTipLines', () => {
  it('줄바꿈이 있으면 줄 단위로 나누고 빈 줄을 거른다', () => {
    expect(splitTipLines('첫째 줄이에요.\n\n  둘째 줄이에요.  ')).toEqual([
      '첫째 줄이에요.',
      '둘째 줄이에요.',
    ]);
  });

  it('한 줄에 여러 문장이 이어지면 문장 경계에서 나눈다', () => {
    expect(splitTipLines('교환 재료는 네임드 토벌 보상으로 받아요. 강화에도 같은 재료를 써요.')).toEqual([
      '교환 재료는 네임드 토벌 보상으로 받아요.',
      '강화에도 같은 재료를 써요.',
    ]);
  });

  it('Lv.6이나 소수점처럼 마침표 뒤에 공백이 없는 표기는 쪼개지 않는다', () => {
    expect(splitTipLines('Lv.6부터 강화 포인트를 얻어요.')).toEqual(['Lv.6부터 강화 포인트를 얻어요.']);
    expect(splitTipLines('배수 ×1.05가 적용돼요.')).toEqual(['배수 ×1.05가 적용돼요.']);
  });

  it('빈 문자열은 빈 배열을 돌려준다', () => {
    expect(splitTipLines('   ')).toEqual([]);
  });
});
