import { describe, expect, it } from 'vitest';
import { OPEN_WORLD_ZONE_UNLOCKS, REGION_NAMES, REGION_ORDER, formatAdminLocation } from './regions';

describe('관리자 지역 및 위치 포맷', () => {
  it('진행 지역 순서에는 현행 오픈월드 지역(마을, 대양)만 포함하고 폐지된 구 바다 6개는 제외한다', () => {
    expect(REGION_ORDER).toEqual(['village', 'world']);
    for (const legacy of ['ocean', 'seasia', 'indian', 'madagascar', 'southatlantic', 'northatlantic']) {
      expect(REGION_ORDER).not.toContain(legacy);
    }
    expect(REGION_NAMES.southatlantic).toBe('남대서양');
    expect(REGION_NAMES.northatlantic).toBe('북대서양');
  });

  it('오픈월드 존 및 수배 해금 목록은 현행 7개 최상위 존과 배 단계 기준을 제공한다', () => {
    expect(OPEN_WORLD_ZONE_UNLOCKS.map(z => [z.id, z.entryBoat, z.hasBounty])).toEqual([
      ['village', 0, false],
      ['pacific', 1, true],
      ['seasia', 3, true],
      ['indian', 5, true],
      ['madagascar', 7, true],
      ['southatlantic', 8, true],
      ['northatlantic', 9, true],
    ]);
  });

  it('원시 위치 키를 읽기 쉬운 한글명으로 바꾸고 미등록 키와 빈 값 경계를 처리한다', () => {
    expect(formatAdminLocation('base:lisbon')).toBe('리스본항');
    expect(formatAdminLocation('base:home')).toBe('집');
    expect(formatAdminLocation('base:harbor')).toBe('부산항');
    expect(formatAdminLocation('base:manila')).toBe('마닐라항');
    expect(formatAdminLocation('base:colombo')).toBe('콜롬보항');
    expect(formatAdminLocation('base:toamasina')).toBe('투아마시나항');
    expect(formatAdminLocation('region:world')).toBe('대양');
    expect(formatAdminLocation('region:southatlantic')).toBe('남대서양');
    expect(formatAdminLocation('region:northatlantic')).toBe('북대서양');
    expect(formatAdminLocation('zone:bermuda')).toBe('버뮤다 삼각지대');
    expect(formatAdminLocation({ kind: 'base', id: 'walvisbay' })).toBe('월비스베이항');
    expect(formatAdminLocation({ kind: 'region', id: 'ocean' })).toBe('태평양');
    expect(formatAdminLocation('base:unknown-port')).toBe('unknown-port');
    expect(formatAdminLocation('region:unknown-sea')).toBe('unknown-sea');
    expect(formatAdminLocation('unknown-token')).toBe('unknown-token');
    expect(formatAdminLocation({ kind: 'other', id: 'x' })).toBe('x');
    expect(formatAdminLocation({ kind: null, id: null })).toBe('—');
    expect(formatAdminLocation('')).toBe('—');
    expect(formatAdminLocation('   ')).toBe('—');
    expect(formatAdminLocation(undefined)).toBe('—');
    expect(formatAdminLocation(null)).toBe('—');
  });
});
