import { describe, expect, it } from 'vitest';
import { hashToUnit, judgeTiming, redZoneCenter, timingPos } from './timing';

describe('hashToUnit', () => {
  it('같은 문자열은 같은 값으로, 값은 [0, 1)에 둔다', () => {
    for (const seed of ['u:1', 'u:2', 'another-user:42', '']) {
      const value = hashToUnit(seed);
      expect(value).toBe(hashToUnit(seed));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('다른 문자열은 보통 다른 값으로 매핑한다', () => {
    expect(hashToUnit('u:1')).not.toBe(hashToUnit('u:2'));
  });
});

describe('redZoneCenter', () => {
  it('같은 시드·존 폭이면 같은 중심을 반환한다', () => {
    expect(redZoneCenter('user:7', 0.4, 0.1)).toBe(redZoneCenter('user:7', 0.4, 0.1));
  });

  it('존 폭 경계에서도 빨간 존이 노란 존을 벗어나지 않는다', () => {
    const cases = [
      { yellow: 0.4, red: 0.01 },
      { yellow: 0.4, red: 0.2 },
      { yellow: 0.8, red: 0.01 },
      { yellow: 0.8, red: 0.2 },
    ];
    for (const { yellow, red } of cases) {
      for (let version = 1; version <= 200; version++) {
        const center = redZoneCenter(`user:${version}`, yellow, red);
        expect(center - red / 2).toBeGreaterThanOrEqual(0.5 - yellow / 2 - 1e-12);
        expect(center + red / 2).toBeLessThanOrEqual(0.5 + yellow / 2 + 1e-12);
      }
    }
  });

  it('중심은 노란 존 내부 20~80% 구간과 존 포함 범위의 교집합에 둔다', () => {
    for (const { yellow, red } of [{ yellow: 0.4, red: 0.1 }, { yellow: 0.8, red: 0.2 }]) {
      const amplitude = Math.min(0.3 * yellow, (yellow - red) / 2);
      for (let version = 1; version <= 100; version++) {
        const center = redZoneCenter(`user:${version}`, yellow, red);
        expect(Math.abs(center - 0.5)).toBeLessThanOrEqual(amplitude + 1e-12);
      }
    }
  });

  it('빨간 존이 노란 존보다 넓거나 같으면 중심을 노란 존 중앙에 고정한다', () => {
    expect(redZoneCenter('user:1', 0.1, 0.1)).toBe(0.5);
    expect(redZoneCenter('user:1', 0.1, 0.2)).toBe(0.5);
  });
});

describe('judgeTiming의 빨간 존 중심', () => {
  it('기본 중심은 기존처럼 바 중앙이다', () => {
    expect(judgeTiming(0.5, 0.4, 0.1)).toBe('perfect');
    expect(judgeTiming(0.56, 0.4, 0.1)).toBe('good');
  });

  it('빨간 존 중심을 옮기면 그 위치를 기준으로 perfect를 판정한다', () => {
    expect(judgeTiming(0.6, 0.4, 0.1, 0.6)).toBe('perfect');
    expect(judgeTiming(0.55, 0.4, 0.1, 0.6)).toBe('perfect'); // 빨간 존 왼쪽 경계
    expect(judgeTiming(0.65, 0.4, 0.1, 0.6)).toBe('perfect'); // 빨간 존 오른쪽 경계
    expect(judgeTiming(0.54, 0.4, 0.1, 0.6)).toBe('good');
    expect(judgeTiming(0.71, 0.4, 0.1, 0.6)).toBe('normal');
  });
});

describe('timingPos', () => {
  it('챔질 경과를 바 비율 위치로 환산한다', () => {
    expect(timingPos(700, 1.4)).toBeCloseTo(0.5, 8);
    expect(timingPos(0, 1.4)).toBe(0);
  });

  it('경과나 스윕이 유효하지 않으면 null을 돌려준다', () => {
    expect(timingPos(undefined, 1.4)).toBeNull();
    expect(timingPos(-1, 1.4)).toBeNull();
    expect(timingPos(Number.NaN, 1.4)).toBeNull();
    expect(timingPos(100, 0)).toBeNull();
  });
});
