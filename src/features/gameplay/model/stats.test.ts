import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../../game/content/spots';
import { newState } from '../../../game/rules/logic';
import { selectInitialStatsSpotIndex, selectStatsModalData } from './stats';

describe('플레이 스탯 화면 데이터', () => {
  it('현재 지역에서 요구 파워가 가장 높은 수역부터 시작한다', () => {
    const index = selectInitialStatsSpotIndex('village');
    const expected = SPOTS.map((spot, spotIndex) => ({ spot, spotIndex }))
      .filter(({ spot }) => spot.region === 'village')
      .sort((a, b) => (a.spot.powerReq ?? 0) - (b.spot.powerReq ?? 0))
      .at(-1)!;

    expect(index).toBe(expected.spotIndex);
  });

  it('선택한 수역 기준 스탯과 파워 상태를 구성한다', () => {
    const game = newState();
    const data = selectStatsModalData(game, 'walk', 0);

    expect(data.spot).toBe(SPOTS[0]);
    expect(data.underpowered).toBe(data.currentPower < data.requirement);
    expect(data.axes.sweep.value).toBeGreaterThan(0);
  });
});
