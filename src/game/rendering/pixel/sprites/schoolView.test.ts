import { describe, it, expect } from 'vitest';
import { schoolRoster, rosterPick, orbit, jumpHeight, JUMP_S, JUMP_PX, ROSTER_CYCLE_S } from './schoolView';
import { FISH } from '../../../content/fish';

describe('어군 명부', () => {
  it('낮에는 밤 어종을 빼고, 밤에는 넣는다', () => {
    const nightSpot = FISH.find(f => f.night)!.spot;
    const day = schoolRoster(nightSpot, false), night = schoolRoster(nightSpot, true);
    expect(day.every(f => !f.night)).toBe(true);
    expect(night.length).toBeGreaterThan(day.length);
    expect(night.some(f => f.night)).toBe(true);
  });

  it('자리별 종이 주기마다 한 칸씩 돌아 명부 전체가 보인다', () => {
    const roster = schoolRoster('pond', false);
    const seen = new Set<string>();
    for (let k = 0; k < roster.length; k++) seen.add(rosterPick(roster, 0, k * ROSTER_CYCLE_S)!.id);
    expect(seen.size).toBe(roster.length);
    expect(rosterPick([], 0, 0)).toBeUndefined();
  });
});

describe('궤도와 점프', () => {
  it('입질이면 궤도 반지름이 줄어 찌 쪽으로 몰린다', () => {
    const far = Math.max(...[0, 0.5, 1, 1.5].map(t => Math.hypot(orbit(0, t, false).dx, orbit(0, t, false).dy)));
    const near = Math.max(...[0, 0.5, 1, 1.5].map(t => Math.hypot(orbit(0, t, true).dx, orbit(0, t, true).dy)));
    expect(near).toBeLessThan(far);
  });

  it('점프는 0에서 시작해 중간에 최고, JUMP_S 뒤에는 0', () => {
    expect(jumpHeight(0)).toBe(0);
    expect(jumpHeight(JUMP_S / 2)).toBe(JUMP_PX);
    expect(jumpHeight(JUMP_S)).toBe(0);
    expect(jumpHeight(-1)).toBe(0);
    expect(jumpHeight(5)).toBe(0);
  });
});
