import { describe, expect, it } from 'vitest';
import { FERRY_MOVE_AT_MS, ferryFrame } from './ferryTransition';

describe('ferryFrame: 여객선 빠른 이동 전환 단계', () => {
  it('앞바다 모습 0.6초 동안은 화면이 밝다', () => {
    expect(ferryFrame(0, null)).toEqual({ phase: 'surface', veil: 0 });
    expect(ferryFrame(599, null)).toEqual({ phase: 'surface', veil: 0 });
  });

  it('0.6초부터 0.3초 동안 어두워진다', () => {
    expect(ferryFrame(600, null)).toEqual({ phase: 'fadeOut', veil: 0 });
    expect(ferryFrame(750, null).veil).toBeCloseTo(0.5);
    expect(ferryFrame(899, null).phase).toBe('fadeOut');
  });

  it('0.9초부터 완전 암전이고 이때 위치를 바꾼다', () => {
    expect(FERRY_MOVE_AT_MS).toBe(900);
    expect(ferryFrame(900, null)).toEqual({ phase: 'dark', veil: 1 });
  });

  it('응답이 일찍 와도 암전은 0.2초 유지된 뒤 1.1초에 밝아지기 시작한다', () => {
    expect(ferryFrame(1000, 950)).toEqual({ phase: 'dark', veil: 1 });
    expect(ferryFrame(1099, 950).phase).toBe('dark');
    expect(ferryFrame(1100, 950)).toEqual({ phase: 'fadeIn', veil: 1 });
    expect(ferryFrame(1250, 950).veil).toBeCloseTo(0.5);
    expect(ferryFrame(1399, 950).phase).toBe('fadeIn');
  });

  it('1.4초에 전환이 끝난다', () => {
    expect(ferryFrame(1400, 950)).toEqual({ phase: 'done', veil: 0 });
  });

  it('응답이 없으면 암전을 유지한다', () => {
    expect(ferryFrame(60000, null)).toEqual({ phase: 'dark', veil: 1 });
  });

  it('응답이 늦으면 응답 시각부터 0.3초 동안 밝아진다', () => {
    expect(ferryFrame(2500, 2500)).toEqual({ phase: 'fadeIn', veil: 1 });
    expect(ferryFrame(2650, 2500).veil).toBeCloseTo(0.5);
    expect(ferryFrame(2800, 2500)).toEqual({ phase: 'done', veil: 0 });
    expect(ferryFrame(2700, 2500).phase).toBe('fadeIn');
  });
});
