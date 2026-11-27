import { describe, expect, it } from 'vitest';
import { EVENT_ZONE_MOVE_AT_MS, eventZoneVeilFrame } from './eventZoneTransition';

describe('eventZoneVeilFrame: 산타 동산 이동 연출 단계', () => {
  it('0ms부터 260ms 미만까지 어두워진다(fadeOut)', () => {
    expect(EVENT_ZONE_MOVE_AT_MS).toBe(260);
    expect(eventZoneVeilFrame(0, null)).toEqual({ phase: 'fadeOut', veil: 0 });
    expect(eventZoneVeilFrame(130, null).phase).toBe('fadeOut');
    expect(eventZoneVeilFrame(130, null).veil).toBeCloseTo(0.5);
    expect(eventZoneVeilFrame(259, null).phase).toBe('fadeOut');
  });

  it('260ms부터 완전 암전이고 응답이 없으면 암전을 유지한다', () => {
    expect(eventZoneVeilFrame(260, null)).toEqual({ phase: 'dark', veil: 1 });
    expect(eventZoneVeilFrame(60000, null)).toEqual({ phase: 'dark', veil: 1 });
  });

  it('응답이 일찍 와도 최소 암전 320ms를 채운 580ms부터 320ms 동안 밝아진다', () => {
    expect(eventZoneVeilFrame(400, 300)).toEqual({ phase: 'dark', veil: 1 });
    expect(eventZoneVeilFrame(579, 300)).toEqual({ phase: 'dark', veil: 1 });
    expect(eventZoneVeilFrame(580, 300)).toEqual({ phase: 'fadeIn', veil: 1 });
    expect(eventZoneVeilFrame(740, 300).phase).toBe('fadeIn');
    expect(eventZoneVeilFrame(740, 300).veil).toBeCloseTo(0.5);
    expect(eventZoneVeilFrame(899, 300).phase).toBe('fadeIn');
    expect(eventZoneVeilFrame(900, 300)).toEqual({ phase: 'done', veil: 0 });
  });

  it('응답이 늦으면 응답 시각부터 320ms 동안 밝아진 뒤 끝난다', () => {
    expect(eventZoneVeilFrame(1000, 1100)).toEqual({ phase: 'dark', veil: 1 });
    expect(eventZoneVeilFrame(1100, 1100)).toEqual({ phase: 'fadeIn', veil: 1 });
    expect(eventZoneVeilFrame(1260, 1100).veil).toBeCloseTo(0.5);
    expect(eventZoneVeilFrame(1419, 1100).phase).toBe('fadeIn');
    expect(eventZoneVeilFrame(1420, 1100)).toEqual({ phase: 'done', veil: 0 });
  });
});
