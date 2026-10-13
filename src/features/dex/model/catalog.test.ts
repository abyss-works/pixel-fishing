import { describe, expect, it } from 'vitest';
import { BOUNTIES } from '../../../game/content/bounties';
import { FISH, newState } from '../../../game/rules/logic';
import { topZoneOfSpot } from '../../../game/content/zones';
import { selectDexDetailData, selectDexGrid, selectNamedDex } from './catalog';

describe('도감 조회 데이터', () => {
  it('폼별 발견 수와 존·수역 어종을 구성한다', () => {
    const game = newState();
    const fish = FISH[0];
    game.dex[fish.id] = { normal: { count: 2, maxSize: 20, first: null } };
    const zone = topZoneOfSpot(fish.spot)!;

    const data = selectDexGrid(game, zone, 'normal');

    expect(data.foundCount).toBe(1);
    expect(data.fishCount).toBe(FISH.length);
    expect(data.zones.find(row => row.id === zone)?.foundCount).toBeGreaterThanOrEqual(1);
    expect(data.spots.find(row => row.spot.id === fish.spot)?.fishes
      .find(row => row.fish.id === fish.id))
      .toMatchObject({ fish, discovered: true, count: 2 });
  });

  it('네임드 도감은 대상 기록으로 달성 수와 공개 데이터를 만든다', () => {
    const game = newState();
    const quest = BOUNTIES.find(candidate => candidate.difficulty === 'named'
      && candidate.targetFish !== null)!;
    game.dex[quest.targetFish!] = { normal: { count: 1, maxSize: 20, first: null } };

    const data = selectNamedDex(game, quest.zone);

    expect(data.foundCount).toBe(1);
    expect(data.quests.find(row => row.quest.id === quest.id)).toMatchObject({
      found: true,
      displayName: expect.any(String),
    });
  });

  it('상세 화면은 폼별 기록·가격·크기 정보를 한 번에 제공한다', () => {
    const game = newState();
    const fish = FISH[0];
    game.dex[fish.id] = { normal: { count: 2, maxSize: 30, first: '2026-01-01' } };

    const forms = selectDexDetailData(game, fish);

    expect(forms).toHaveLength(2);
    expect(forms[0]).toMatchObject({
      form: 'normal', discovered: true, count: 2, maxSize: 30, firstCaught: '2026-01-01',
    });
    expect(forms[0].price).toBeGreaterThan(0);
    expect(forms[0].sizePercentile).toBeGreaterThanOrEqual(0);
    expect(forms[1].discovered).toBe(false);
  });
});
