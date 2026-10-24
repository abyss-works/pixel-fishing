import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../../game/content/spots';
import { FISH, newState } from '../../../game/rules/logic';
import type { FishInstance, GameState } from '../../../game/rules/logic';
import {
  BONUS_CATEGORIES, selectActiveBonuses, selectInitialStatsSpotIndex, selectReachableZones,
  selectStatsModalData, selectStatsSpotRows, selectStatsSummary, selectStatsZoneTabs,
} from './stats';

const game = (over: Partial<GameState>): GameState => ({ ...newState(), ...over });
const indexOf = (id: string) => SPOTS.findIndex(spot => spot.id === id);
const rowOf = (g: GameState, id: string) => selectStatsSpotRows(g, 'sail').find(row => row.spot.id === id)!;

describe('플레이 스탯 화면 데이터', () => {
  it('현재 지역에서 요구 파워가 가장 높은 수역부터 시작한다', () => {
    const index = selectInitialStatsSpotIndex('village');
    const expected = SPOTS.map((spot, spotIndex) => ({ spot, spotIndex }))
      .filter(({ spot }) => spot.region === 'village')
      .sort((a, b) => (a.spot.powerReq ?? 0) - (b.spot.powerReq ?? 0))
      .at(-1)!;

    expect(index).toBe(expected.spotIndex);
  });

  it('사거리 안의 어군 수역이 있으면 그 수역부터 시작한다', () => {
    expect(selectInitialStatsSpotIndex('world', 'deep')).toBe(indexOf('deep'));
    expect(selectInitialStatsSpotIndex('world', null)).toBe(selectInitialStatsSpotIndex('world'));
  });

  it('선택한 수역 기준 스탯과 파워 상태를 구성한다', () => {
    const data = selectStatsModalData(newState(), 'walk', 0);

    expect(data.spot).toBe(SPOTS[0]);
    expect(data.underpowered).toBe(data.currentPower < data.requirement);
    expect(data.axes.sweep.value).toBeGreaterThan(0);
  });
});

describe('스탯 해역 목록', () => {
  it('해역마다 배가 없으면 boat, 파워가 모자라면 power, 둘 다 되면 ok다', () => {
    const g = game({ boat: 1, rod: 3 });
    expect(rowOf(g, 'river').fit).toBe('ok');
    expect(rowOf(g, 'sea').fit).toBe('power');
    expect(rowOf(g, 'deep').fit).toBe('boat');
  });

  it('배 조건이 파워 조건보다 먼저다', () => {
    expect(rowOf(game({ boat: 1, rod: 1 }), 'deep').fit).toBe('boat');
  });

  it('해역마다 그 해역 기준 스탯을 함께 싣는다', () => {
    const g = game({ boat: 5, rod: 18 });
    const row = rowOf(g, 'indian');
    expect(row.spotIndex).toBe(indexOf('indian'));
    expect(row.data).toEqual(selectStatsModalData(g, 'sail', indexOf('indian')));
    expect(row.zone).toBe('indian');
  });

  it('지역 탭은 바다 지역마다 충족 수를 세고, 마을은 지금 마을에 있을 때만 넣는다', () => {
    const rows = selectStatsSpotRows(game({ boat: 1, rod: 3 }), 'sail');
    const atSea = selectStatsZoneTabs(rows, 'pacific');
    expect(atSea.map(tab => tab.zone)).toEqual(['pacific', 'seasia', 'indian', 'madagascar']);
    expect(atSea[0]).toMatchObject({ zone: 'pacific', ok: 0, total: 2 });

    const inVillage = selectStatsZoneTabs(rows, 'village');
    expect(inVillage[0]).toMatchObject({ zone: 'village', ok: 2, total: 2 });
  });
});

describe('갈 수 있는 지역', () => {
  it('지역마다 배로 갈 수 있는 해역 수를 세고, 하나도 못 가면 가장 낮은 필요한 배를 준다', () => {
    const zones = selectReachableZones(game({ boat: 1 }));
    expect(zones.find(z => z.zone === 'pacific')).toMatchObject({ open: 1, total: 2, needBoat: null });
    expect(zones.find(z => z.zone === 'seasia')).toMatchObject({ open: 0, total: 3, needBoat: 3 });
    expect(zones.find(z => z.zone === 'village')).toMatchObject({ open: 2, total: 2, needBoat: null });
  });
});

describe('스탯 요약', () => {
  it('도감은 일반 폼으로 한 번이라도 낚은 어종 수이고, 가방은 가방 상태 선택자를 따른다', () => {
    const [a, b] = FISH;
    const g = game({
      boat: 1,
      dex: { [a.id]: { normal: { count: 2, maxSize: 10, first: null } }, [b.id]: { variant: { count: 1, maxSize: 10, first: null } } },
      bag: Array.from({ length: 70 }, (_, i) => ({ uid: `f${i}` }) as FishInstance),
    } as Partial<GameState>);
    const summary = selectStatsSummary(g);
    expect(summary.dexFound).toBe(1);
    expect(summary.dexTotal).toBe(FISH.length);
    expect(summary.bag).toMatchObject({ count: 70, cap: 140, percent: 50 });
  });
});

describe('받는 보너스', () => {
  it('가진 유물의 효과를 효과마다 한 줄로, 갈래를 붙여 모은다', () => {
    const g = game({ boat: 5, rod: 18, artifacts: ['abyss-angler', 'wreck-compass'] });
    const relics = selectActiveBonuses(g, rowOf(g, 'indian')).filter(b => b.source.kind === 'relic');
    expect(relics.map(b => [b.category, b.source.kind === 'relic' && b.source.artifact.id, b.source.kind === 'relic' && b.source.effect]))
      .toEqual([['duel', 'abyss-angler', 'duelSpeedupCut'], ['move', 'wreck-compass', 'sail']]);
  });

  it('켜 둔 미끼는 낚시 갈래의 직접 낚을 때만 효과다', () => {
    const g = game({ activeBait: 'bait-rare' });
    const bait = selectActiveBonuses(g, rowOf(g, 'river')).find(b => b.source.kind === 'bait');
    expect(bait).toMatchObject({ category: 'fish', manualOnly: true });
  });

  it('파워가 요구를 넘는 해역에서는 수동 보정과 영역을 낚싯대 보너스로 싣는다', () => {
    const g = game({ boat: 5, rod: 18 });
    const row = rowOf(g, 'indian');
    const power = selectActiveBonuses(g, row).filter(b => b.source.kind === 'power');
    expect(power.map(b => b.source.kind === 'power' && b.source.stat)).toEqual(['manual', 'good']);
    expect(power[0]).toMatchObject({ category: 'fish', manualOnly: true });
    expect(power[0].source.kind === 'power' && power[0].source.value).toBe(row.data.manualBonus.value);
  });

  it('파워가 모자라거나 배가 없는 해역에서는 낚싯대 보너스가 없다', () => {
    const g = game({ boat: 1, rod: 3 });
    expect(selectActiveBonuses(g, rowOf(g, 'sea'))).toEqual([]);
    expect(selectActiveBonuses(g, rowOf(g, 'deep'))).toEqual([]);
  });

  it('갈래 순서는 이동, 낚시, 결투, 상점이다', () => {
    expect(BONUS_CATEGORIES).toEqual(['move', 'fish', 'duel', 'shop']);
  });
});
