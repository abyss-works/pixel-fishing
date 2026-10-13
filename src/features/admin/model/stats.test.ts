import { describe, expect, it } from 'vitest';
import { parseAdminStats, selectAdminBoatOptions } from './stats';

describe('관리자 스탯 입력 데이터', () => {
  it('유효한 값을 정수로 변환하고 배 선택지를 구성한다', () => {
    expect(parseAdminStats({ gold: '10.9', fame: '2', rod: '3.8', boat: '1' }))
      .toEqual({ ok: true, values: { gold: 10, fame: 2, rod: 3, boat: 1 } });
    expect(selectAdminBoatOptions().length).toBeGreaterThan(0);
  });

  it('숫자가 아닌 값은 거부한다', () => {
    expect(parseAdminStats({ gold: 'x', fame: '2', rod: '3', boat: '1' }))
      .toEqual({ ok: false });
  });
});
