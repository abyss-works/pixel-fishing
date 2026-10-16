import { describe, expect, it } from 'vitest';
import { fmtMinutes, josa } from './format';

describe('fmtMinutes — 남은 시간', () => {
  it('시·분으로 나누고 0분은 생략한다', () => {
    expect(fmtMinutes(112)).toBe('1시간 52분');
    expect(fmtMinutes(120)).toBe('2시간');
    expect(fmtMinutes(52)).toBe('52분');
    expect(fmtMinutes(0)).toBe('1분 미만');
  });
});

describe('josa — 받침에 따른 조사', () => {
  it('받침이 있으면 이·을, 없으면 가·를', () => {
    expect(josa('메갈로돈', '이/가')).toBe('메갈로돈이');
    expect(josa('아난타', '이/가')).toBe('아난타가');
    expect(josa('둔클레오스', '을/를')).toBe('둔클레오스를');
    expect(josa('리바이어던', '을/를')).toBe('리바이어던을');
  });
});
