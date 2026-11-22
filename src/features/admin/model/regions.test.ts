import { describe, expect, it } from 'vitest';
import { REGION_NAMES, REGION_ORDER, formatAdminLocation } from './regions';

describe('관리자 지역 및 위치 포맷', () => {
  it('남대서양과 북대서양을 지역명·순서에 포함한다', () => {
    expect(REGION_NAMES.southatlantic).toBe('남대서양');
    expect(REGION_NAMES.northatlantic).toBe('북대서양');
    expect(REGION_ORDER).toContain('southatlantic');
    expect(REGION_ORDER).toContain('northatlantic');
  });

  it('원시 위치 키를 읽기 쉬운 한글명으로 바꾼다', () => {
    expect(formatAdminLocation('base:lisbon')).toBe('리스본항');
    expect(formatAdminLocation('base:home')).toBe('집');
    expect(formatAdminLocation('region:world')).toBe('대양');
    expect(formatAdminLocation('region:southatlantic')).toBe('남대서양');
    expect(formatAdminLocation('region:northatlantic')).toBe('북대서양');
    expect(formatAdminLocation({ kind: 'base', id: 'walvisbay' })).toBe('월비스베이항');
    expect(formatAdminLocation({ kind: 'region', id: 'ocean' })).toBe('태평양');
    expect(formatAdminLocation({ kind: null, id: null })).toBe('—');
    expect(formatAdminLocation(null)).toBe('—');
  });
});
