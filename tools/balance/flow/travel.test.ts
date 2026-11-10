import { describe, expect, it } from 'vitest';
import { BOATS } from '../../../src/game/content/boats';
import { SPOTS } from '../../../src/game/content/spots';
import { WALK_SPEED } from '../../../src/game/rules/balance';
import { capOfBoat } from '../../../src/game/rules/logic';
import { TRAVEL_MATERIAL, travelRows } from './travel';

const rows = travelRows(20);

describe('이동 측정', () => {
  it('모든 해역마다 한 행이고 마을은 도보, 바다는 그 해역을 여는 배의 속도다', () => {
    expect(rows.map(r => r.spot)).toEqual(SPOTS.map(s => s.id));
    for (const r of rows) {
      const spot = SPOTS.find(s => s.id === r.spot)!;
      expect(r.speed).toBe(spot.boatTier === 0 ? WALK_SPEED : BOATS.find(b => b.tier === spot.boatTier)!.speed);
      expect(r.bagCap).toBe(capOfBoat(spot.boatTier));
    }
  });

  it('왕복 시간은 평균 거리를 속도로 나눠 두 배 한 값이고 비중은 왕복 ÷ (가방 채움 + 왕복)이다', () => {
    for (const r of rows) {
      expect(r.distance).toBeGreaterThan(0);
      expect(r.distanceMax).toBeGreaterThanOrEqual(r.distance);
      expect(r.tripSec).toBeCloseTo(2 * r.distance / r.speed, 9);
      expect(r.fillSec).toBeGreaterThan(0);
      expect(r.share).toBeCloseTo(r.tripSec / (r.fillSec + r.tripSec), 9);
    }
  });

  it('비중 5%에 닿기까지 더 얹을 수 있는 왕복 초를 낸다', () => {
    for (const r of rows) {
      const withExtra = (r.tripSec + r.headroomSec) / (r.fillSec + r.tripSec + r.headroomSec);
      expect(withExtra).toBeCloseTo(TRAVEL_MATERIAL, 9);
    }
  });

  it('같은 날 수는 같은 값을 낸다', () => {
    expect(travelRows(20)).toEqual(rows);
  });

  it('날 수가 1보다 작으면 거부한다', () => {
    expect(() => travelRows(0)).toThrow(/1 이상/);
  });
});
