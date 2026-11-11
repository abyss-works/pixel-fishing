import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../../game/content/spots';
import { commonWeightMultiplier } from '../../../game/rules/actions';
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

describe('방치 낚시 배수 표시', () => {
  const idleOf = (g: GameState, id: string) => selectStatsModalData(g, 'sail', indexOf(id)).idle;
  const applied = (g: GameState, id: string) => {
    const d = selectStatsModalData(g, 'sail', indexOf(id));
    return commonWeightMultiplier('auto', d.currentPower, d.spot.id, d.powerZones.mult).total;
  };

  it('파워가 모자란 해역은 표시값이 적용값(배수 x 페널티)과 같고, 페널티를 따로 싣는다', () => {
    const g = game({ boat: 5, rod: 3 });
    const idle = idleOf(g, 'sea');
    expect(idle.penalty).toBeGreaterThan(1);
    expect(idle.applied).toBe(applied(g, 'sea'));
    expect(idle.applied).toBe(idle.current * idle.penalty);
  });

  it('파워가 충분한 해역은 페널티 1이고 표시값이 적용값과 같다', () => {
    const g = game({ boat: 5, rod: 18 });
    const idle = idleOf(g, 'sea');
    expect(idle.penalty).toBe(1);
    expect(idle.applied).toBe(applied(g, 'sea'));
  });

  it('요구 파워에서의 배수를 함께 싣는다', () => {
    const idle = idleOf(game({ boat: 5, rod: 3 }), 'sea');
    expect(idle.required).toBe(commonWeightMultiplier('auto', 30, 'sea', 1).idle);
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
    expect(atSea.map(tab => tab.zone)).toEqual(['pacific', 'seasia', 'indian', 'madagascar', 'southatlantic']);
    expect(atSea[0]).toMatchObject({ zone: 'pacific', ok: 0, total: 2 });

    const inVillage = selectStatsZoneTabs(rows, 'village');
    expect(inVillage[0]).toMatchObject({ zone: 'village', ok: 2, total: 2 });
  });
});

describe('갈 수 있는 지역', () => {
  it('지역마다 배로 갈 수 있는 해역 수를 세고, 못 가는 해역을 여는 가장 낮은 배를 준다', () => {
    const zones = selectReachableZones(game({ boat: 1 }));
    const pacific = zones.find(z => z.zone === 'pacific')!;
    expect(pacific).toMatchObject({ open: 1, total: 2 });
    expect(pacific.nextBoat).toBe(2);
    expect(zones.find(z => z.zone === 'seasia')).toMatchObject({ open: 0, total: 3, nextBoat: 3 });
    expect(zones.find(z => z.zone === 'village')).toMatchObject({ open: 2, total: 2, nextBoat: null });
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
    const relics = selectActiveBonuses(g).filter(b => b.source.kind === 'relic');
    expect(relics.map(b => [b.category, b.source.kind === 'relic' && b.source.artifact.id, b.source.kind === 'relic' && b.source.effect]))
      .toEqual([['duel', 'abyss-angler', 'duelSpeedupCut'], ['move', 'wreck-compass', 'sail']]);
  });

  it('진주 상인의 저울은 요리 추가 완성 확률 줄을 낚시 갈래에 낸다', () => {
    const g = game({ artifacts: ['varuna-scale'], artifactLevels: { 'varuna-scale': 2 } });
    const rows = selectActiveBonuses(g).filter(b => b.source.kind === 'relic');
    expect(rows.map(b => [b.category, b.source.kind === 'relic' && b.source.effect, b.source.kind === 'relic' && b.source.level]))
      .toEqual([['fish', 'extraCookChance', 2]]);
  });

  it('유물 보너스 줄에 보유 레벨이 붙는다 - 맵에 없으면 Lv1', () => {
    const g = game({ artifacts: ['abyss-angler', 'wreck-compass'], artifactLevels: { 'wreck-compass': 4 } });
    const levels = selectActiveBonuses(g).flatMap(b => b.source.kind === 'relic' ? [[b.source.artifact.id, b.source.level]] : []);
    expect(levels).toEqual([['abyss-angler', 1], ['wreck-compass', 4]]);
  });

  it('효과가 없는 전설 유물은 보너스 줄을 내지 않는다', () => {
    const g = game({ artifacts: ['mami-wata-mirror'] });
    expect(selectActiveBonuses(g).filter(b => b.source.kind === 'relic')).toEqual([]);
  });

  it('길드 보너스는 1단계 이상인 효과만 "길드 Lv.N" 출처로 갈래를 붙여 모은다', () => {
    const effects = { sell: 0.04, bag: 0.08, named: 0, rare: 0.02, mutation: 0.01 };
    const guild = selectActiveBonuses(game({}), { level: 5, effects }).filter(b => b.source.kind === 'guild');
    expect(guild.map(b => [b.category, b.source.kind === 'guild' && b.source.bonus, b.source.kind === 'guild' && b.source.value]))
      .toEqual([['shop', 'sell', 0.04], ['fish', 'bag', 0.08], ['fish', 'rare', 0.02], ['fish', 'mutation', 0.01]]);
    expect(guild[0].source).toMatchObject({ kind: 'guild', level: 5 });
    expect(guild.every(b => !b.manualOnly)).toBe(true);
  });

  it('요약의 가방은 길드 가방 보너스를 반영한다', () => {
    expect(selectStatsSummary(game({ boat: 0 }), 0.2).bag.cap).toBe(72);
  });

  it('낚싯대 파워에서 오는 효과는 보너스에 넣지 않는다 — 낚싯대 탭이 해역별로 보여 준다', () => {
    const g = game({ boat: 5, rod: 18 });
    expect(selectActiveBonuses(g)).toEqual([]);
  });

  it('갈래 순서는 이동, 낚시, 결투, 상점이다', () => {
    expect(BONUS_CATEGORIES).toEqual(['move', 'fish', 'duel', 'shop']);
  });
});
