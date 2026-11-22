import { describe, expect, it } from 'vitest';
import type { Stat } from '../../../game/rules/stats';
import { formatStatMods, formatStatValue } from './statFormat';

const stat = (base: number, mods: Stat['mods'], value: number): Stat => ({ base, mods, value });

describe('formatStatValue', () => {
  it('digits=0이면 반올림 정수에 천 단위 쉼표를 넣는다', () => {
    expect(formatStatValue(4640, '마리', 0)).toBe('4,640마리');
    expect(formatStatValue(60, '마리', 0)).toBe('60마리');
    expect(formatStatValue(123.6, '', 0)).toBe('124');
  });

  it('digits>0이면 지정 소수 자릿수로 고정한다', () => {
    expect(formatStatValue(2.25, '초', 1)).toBe('2.3초');
    expect(formatStatValue(1.5, '초')).toBe('1.5초');
  });
});

describe('formatStatMods', () => {
  it('보정이 없고 비래칫이면 null을 돌려준다', () => {
    expect(formatStatMods(stat(60, [], 60), '마리', 0)).toBeNull();
    expect(formatStatMods(stat(2.5, [], 2.5), '초', 1)).toBeNull();
  });

  it('digits=0 정수 보정 내역에 천 단위 쉼표를 넣는다', () => {
    const s = stat(4000, [
      { id: 'guild-bag', label: '길드 가방 용량', delta: 640 },
      { id: 'relic-sargasso-net', label: '사르가소의 그물망', delta: 400 },
    ], 5040);
    expect(formatStatMods(s, '마리', 0)).toBe(
      '기본 4,000마리 +640마리 (길드 가방 용량) +400마리 (사르가소의 그물망) = 5,040마리',
    );
  });

  it('래칫 상태에서는 보정 합계 뒤에 초과 보유 유지를 덧붙인다', () => {
    const withMods = stat(4000, [{ id: 'guild-bag', label: '길드 가방 용량', delta: 640 }], 5200);
    expect(formatStatMods(withMods, '마리', 0)).toBe(
      '기본 4,000마리 +640마리 (길드 가방 용량) = 4,640마리 (초과 보유 5,200마리 유지)',
    );

    const withoutMods = stat(60, [], 1200);
    expect(formatStatMods(withoutMods, '마리', 0)).toBe('기본 60마리 (초과 보유 1,200마리 유지)');
  });

  it('digits=1이나 소수 delta가 있으면 소수 첫째 자리 포맷을 유지한다', () => {
    const bite = stat(2.5, [{ id: 'relic-outer-isle-sinker', label: '바깥섬의 봉돌', delta: -0.25 }], 2.25);
    expect(formatStatMods(bite, '초', 1)).toBe('기본 2.5초 -0.3초 (바깥섬의 봉돌) = 2.3초');

    const speed = stat(110, [{ id: 'relic-wreck-compass', label: '침선의 나침반', delta: 13.2 }], 123.2);
    expect(formatStatMods(speed, '', 0)).toBe('기본 110 +13.2 (침선의 나침반) = 123.2');
  });
});
