import { describe, expect, it } from 'vitest';
import type { School } from '../../../game/world/types';
import { SPOTS } from '../../../game/content/spots';
import { rarityRank } from '../../../game/content/rarity';
import { newState } from '../../../game/rules/logic';
import { rankNearbySpots, selectFishAtSpot } from './regionView';

describe('지역 탭 파생 데이터', () => {
  it('위치가 있으면 가장 가까운 어군을 앞에 두고 제한 수만 반환한다', () => {
    const [near, middle, far] = SPOTS;
    const schools: School[] = [
      { id: 'near-school', spot: near.id, x: 2, y: 0 },
      { id: 'middle-school', spot: middle.id, x: 5, y: 0 },
      { id: 'far-school', spot: far.id, x: 10, y: 0 },
    ];

    const result = rankNearbySpots([far, near, middle], schools, { x: 0, y: 0 }, 2);

    expect(result.map(row => row.spot.id)).toEqual([near.id, middle.id]);
    expect(result.map(row => row.distancePx)).toEqual([2, 5]);
  });

  it('좌표가 없으면 기존 어군 순서를 유지한다', () => {
    const spots = SPOTS.slice(0, 3);
    expect(rankNearbySpots(spots, [], null).map(row => row.spot.id))
      .toEqual(spots.map(spot => spot.id));
  });

  it('수역 어종을 등급 순으로 반환한다', () => {
    const spot = SPOTS[0];
    const fishes = selectFishAtSpot(spot.id, newState());
    expect(fishes.every(row => row.fish.spot === spot.id)).toBe(true);
    const ranks = fishes.map(row => rarityRank(row.fish.rarity));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});
