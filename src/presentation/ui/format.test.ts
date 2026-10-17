import { describe, expect, it } from 'vitest';
import { fmtCompact, fmtMinutes, josa } from './format';

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

describe('fmtCompact — HUD용 네 자리 줄임 표기', () => {
  it('9,999까지는 쉼표 표기 그대로 둔다', () => {
    expect(fmtCompact(0)).toBe('0');
    expect(fmtCompact(60)).toBe('60');
    expect(fmtCompact(9_999)).toBe('9,999');
  });

  it('만 단위부터 K·M·B로 줄이고 단위 아래는 버린다', () => {
    expect(fmtCompact(10_000)).toBe('10K');
    expect(fmtCompact(10_999)).toBe('10K');
    expect(fmtCompact(999_999)).toBe('999K');
    expect(fmtCompact(1_000_000)).toBe('1M');
    expect(fmtCompact(1_500_000)).toBe('1M');
    expect(fmtCompact(999_999_999)).toBe('999M');
    expect(fmtCompact(1_000_000_000)).toBe('1B');
    expect(fmtCompact(999_999_999_999)).toBe('999B');
  });

  it('B 다음은 T로 이어 네 자리를 넘지 않는다', () => {
    expect(fmtCompact(1_000_000_000_000)).toBe('1T');
  });
});
