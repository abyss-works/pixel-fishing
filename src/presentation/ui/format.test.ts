import { describe, expect, it } from 'vitest';
import { fmtCompact, fmtCompact3, fmtDecimal2, fmtLevel, fmtMinutes, fmtRatio, fmtRatioTight, fmtSize, josa } from './format';

describe('fmtSize — 물고기 크기', () => {
  it('1m 미만은 cm 소수 한 자리, 1m 이상은 m 소수 두 자리', () => {
    expect(fmtSize(12.34)).toBe('12.3cm');
    expect(fmtSize(99.94)).toBe('99.9cm');
    expect(fmtSize(100)).toBe('1.00m');
    expect(fmtSize(385.2)).toBe('3.85m');
    expect(fmtSize(1085)).toBe('10.85m');
  });
});

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

describe('fmtCompact — HUD용 줄임 표기', () => {
  it('9,999까지는 쉼표 표기 그대로 둔다', () => {
    expect(fmtCompact(0)).toBe('0');
    expect(fmtCompact(60)).toBe('60');
    expect(fmtCompact(9_999)).toBe('9,999');
  });

  it('만 단위부터 K·M·B로 줄이고 소수 한 자리까지 버림으로 보인다', () => {
    expect(fmtCompact(10_000)).toBe('10K');
    expect(fmtCompact(10_999)).toBe('10.9K');
    expect(fmtCompact(12_345)).toBe('12.3K');
    expect(fmtCompact(999_999)).toBe('999.9K');
    expect(fmtCompact(1_000_000)).toBe('1M');
    expect(fmtCompact(1_500_000)).toBe('1.5M');
    expect(fmtCompact(2_300_000)).toBe('2.3M'); // 부동소수 오차로 2.2가 되지 않는다
    expect(fmtCompact(999_999_999)).toBe('999.9M');
    expect(fmtCompact(1_000_000_000)).toBe('1B');
    expect(fmtCompact(999_999_999_999)).toBe('999.9B');
  });

  it('B 다음은 T로 잇는다', () => {
    expect(fmtCompact(1_000_000_000_000)).toBe('1T');
  });
});

describe('fmtCompact3 - 헤더용 유효숫자 3자리 줄임 표기', () => {
  it('999까지는 그대로 보인다', () => {
    expect(fmtCompact3(0)).toBe('0');
    expect(fmtCompact3(60)).toBe('60');
    expect(fmtCompact3(999)).toBe('999');
  });

  it('1000부터 단위(K, M, B, T)로 줄이고 유효숫자 3자리까지 버림으로 보인다', () => {
    expect(fmtCompact3(1_000)).toBe('1K');
    expect(fmtCompact3(1_234)).toBe('1.23K');
    expect(fmtCompact3(9_999)).toBe('9.99K');
    expect(fmtCompact3(10_000)).toBe('10K');
    expect(fmtCompact3(12_400)).toBe('12.4K');
    expect(fmtCompact3(12_999)).toBe('12.9K');
    expect(fmtCompact3(99_999)).toBe('99.9K');
    expect(fmtCompact3(100_000)).toBe('100K');
    expect(fmtCompact3(999_999)).toBe('999K');
  });

  it('단위가 올라가는 경계는 정확히 그 값에서 올라가고, 위 단위도 같은 규칙이다', () => {
    expect(fmtCompact3(1_000_000)).toBe('1M');
    expect(fmtCompact3(1_234_567)).toBe('1.23M');
    expect(fmtCompact3(1_999_999)).toBe('1.99M');
    expect(fmtCompact3(999_999_999)).toBe('999M');
    expect(fmtCompact3(1_000_000_000)).toBe('1B');
    expect(fmtCompact3(1_000_000_000_000)).toBe('1T');
    expect(fmtCompact3(123_456_789_012_345)).toBe('123T');
  });

  it('끝자리 0은 생략하고, 가진 것보다 많아 보이지 않게 버린다', () => {
    expect(fmtCompact3(1_200)).toBe('1.2K');
    expect(fmtCompact3(1_999)).toBe('1.99K');
    expect(fmtCompact3(1_005)).toBe('1K');
  });

  it('음수는 같은 규칙에 부호를 붙인다', () => {
    expect(fmtCompact3(-999)).toBe('-999');
    expect(fmtCompact3(-1_000)).toBe('-1K');
    expect(fmtCompact3(-1_234)).toBe('-1.23K');
    expect(fmtCompact3(-999_999)).toBe('-999K');
  });

  it('보통의 값은 다섯 글자(3자리 + 소수점 + 단위)를 넘지 않는다', () => {
    for (const n of [999, 1_000, 1_234, 99_999, 999_999, 1_999_999, 12_345_678, 999_999_999_999]) {
      expect(fmtCompact3(n).length).toBeLessThanOrEqual(5);
    }
  });

  it('기존 줄임 표기(fmtCompact)의 규칙은 바뀌지 않는다', () => {
    expect(fmtCompact(999_999)).toBe('999.9K');
    expect(fmtCompact(9_999)).toBe('9,999');
  });
});

describe('fmtRatio, fmtRatioTight - 수량과 상한 표기', () => {
  it('fmtRatio는 자릿수 구분 쉼표를 쓰고 슬래시 앞뒤에 공백을 둔다', () => {
    expect(fmtRatio(2990, 2990)).toBe('2,990 / 2,990');
    expect(fmtRatio(0, 500)).toBe('0 / 500');
  });

  it('fmtRatioTight는 붙여 쓰고, 아직 모르면 -를 쓴다', () => {
    expect(fmtRatioTight(1, 1)).toBe('1/1');
    expect(fmtRatioTight(0, 10)).toBe('0/10');
    expect(fmtRatioTight(null, 1)).toBe('-');
  });
});

describe('fmtLevel — 레벨 표기', () => {
  it('Lv. 뒤에 숫자를 붙인다', () => {
    expect(fmtLevel(0)).toBe('Lv.0');
    expect(fmtLevel(8)).toBe('Lv.8');
    expect(fmtLevel(99)).toBe('Lv.99');
  });
});

describe('fmtDecimal2 - 소수 둘째 자리까지, 끝의 0은 뺀다', () => {
  it('정수와 한 자리, 두 자리 값은 필요한 만큼만 보인다', () => {
    expect(fmtDecimal2(10)).toBe('10');
    expect(fmtDecimal2(12.5)).toBe('12.5');
    expect(fmtDecimal2(31.25)).toBe('31.25');
    expect(fmtDecimal2(0)).toBe('0');
  });
  it('셋째 자리부터는 반올림하고 부동소수 오차를 걷는다', () => {
    expect(fmtDecimal2(0.1125 * 100)).toBe('11.25');
    expect(fmtDecimal2(0.3 * 100)).toBe('30');
    expect(fmtDecimal2(12.345)).toBe('12.35');
    expect(fmtDecimal2(12.004)).toBe('12');
  });
});
