import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../../game/content/spots';
import { topZoneOfSpot } from '../../../game/content/zones';
import { commonWeightMultiplier } from '../../../game/rules/actions';
import { FISH, newState } from '../../../game/rules/logic';
import type { FishInstance, GameState } from '../../../game/rules/logic';
import {
  BONUS_CATEGORIES, selectActiveBonuses, selectBonusTableRows, selectInitialStatsSpotIndex, selectReachableZones,
  selectStatsModalData, selectStatsSpotRows, selectStatsSummary, selectStatsZoneTabs,
} from './stats';

const game = (over: Partial<GameState>): GameState => ({ ...newState(), ...over });
const indexOf = (id: string) => SPOTS.findIndex(spot => spot.id === id);
const rowOf = (g: GameState, id: string) => selectStatsSpotRows(g, 'sail').find(row => row.spot.id === id)!;

describe('플레이 스탯 화면 데이터', () => {
  it('마을 거점처럼 해역을 특정할 수 없으면 파워와 배 조건을 채운 해역 중 요구 파워가 가장 높은 곳을 고르고, 없으면 최저 요구 파워 해역으로 폴백한다', () => {
    expect(selectInitialStatsSpotIndex('village', null, 'village', 10, 0)).toBe(indexOf('pond'));
    expect(selectInitialStatsSpotIndex('village', null, 'village', 20, 0)).toBe(indexOf('river'));
    expect(selectInitialStatsSpotIndex('village', null, 'village', 0, 0)).toBe(indexOf('pond'));
  });

  it('사거리 안의 어군 수역이 있으면 파워나 배가 모자라도 그 수역부터 시작한다', () => {
    expect(selectInitialStatsSpotIndex('world', 'deep', 'pacific', 10, 0)).toBe(indexOf('deep'));
    expect(selectInitialStatsSpotIndex('world', null, null, 350, 9)).toBe(selectInitialStatsSpotIndex('world', null, undefined, 350, 9));
  });

  it('바다에서 어군 사거리 밖이면 현재 구역(또는 바다 전체)에서 진입 가능한 최고 해역을 고르고, 없으면 최저 요구 파워 해역으로 폴백한다', () => {
    expect(selectInitialStatsSpotIndex('world', null, 'indian', 135, 5)).toBe(indexOf('indian'));
    expect(selectInitialStatsSpotIndex('world', null, 'indian', 200, 5)).toBe(indexOf('indian'));
    expect(selectInitialStatsSpotIndex('world', null, 'indian', 150, 6)).toBe(indexOf('indian'));
    expect(selectInitialStatsSpotIndex('world', null, 'indian', 160, 6)).toBe(indexOf('southindian'));
    expect(selectInitialStatsSpotIndex('world', null, 'indian', 10, 0)).toBe(indexOf('indian'));

    expect(selectInitialStatsSpotIndex('world', null, 'madagascar', 210, 7)).toBe(indexOf('comorodeep'));
    expect(selectInitialStatsSpotIndex('world', null, 'madagascar', 185, 7)).toBe(indexOf('mozstrait'));
    expect(selectInitialStatsSpotIndex('world', null, 'pacific', 55, 2)).toBe(indexOf('deep'));
    expect(selectInitialStatsSpotIndex('world', null, 'pacific', 10, 0)).toBe(indexOf('sea'));

    expect(selectInitialStatsSpotIndex('world', null, null, 315, 5)).toBe(indexOf('indian'));
    expect(selectInitialStatsSpotIndex('world', null, null, 315, 9)).toBe(indexOf('bermuda'));
    expect(selectInitialStatsSpotIndex('world', null, null, 10, 0)).toBe(indexOf('sea'));
    expect(selectInitialStatsSpotIndex('world', null, 'village', 10, 0)).toBe(indexOf('sea'));
  });

  it('선택한 수역 기준 스탯과 파워 상태를 구성한다', () => {
    const data = selectStatsModalData(newState(), 'walk', 0);

    expect(data.spot).toBe(SPOTS[0]);
    expect(data.underpowered).toBe(data.currentPower < data.requirement);
    expect(data.axes.sweep.value).toBeGreaterThan(0);
  });
});

describe('입질 대기의 요리 출처', () => {
  const T0 = '2026-11-12T00:00:00.000Z';
  const at = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString();
  const cookMod = (g: GameState, now: string) =>
    selectStatsModalData(g, 'sail', 0, now).effectiveBite.min.mods.find(m => m.id === 'cook-lunch');

  it('효과가 든 입질 단축 도시락은 입질 대기 보정 줄에 요리 이름을 출처로 낸다', () => {
    const g = game({ boat: 5, slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(3_600_000) }, bait: null } });
    expect(cookMod(g, T0)).toMatchObject({ label: '가루디야' });
    expect(cookMod(g, T0)!.delta).toBeLessThan(0);
  });

  it('끝난 슬롯이나 빈 슬롯은 보정 줄이 없다', () => {
    const g = game({ boat: 5, slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(3_600_000) }, bait: null } });
    expect(cookMod(g, at(3_600_000))).toBeUndefined();
    expect(cookMod(game({ boat: 5 }), T0)).toBeUndefined();
  });

  it('해역 행 목록도 같은 시각 기준으로 보정을 싣는다', () => {
    const g = game({ boat: 5, slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(3_600_000) }, bait: null } });
    const row = selectStatsSpotRows(g, 'sail', T0)[0];
    expect(row.data.effectiveBite.min.mods.some(m => m.id === 'cook-lunch')).toBe(true);
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
    expect(atSea.map(tab => tab.zone)).toEqual(['pacific', 'seasia', 'indian', 'madagascar', 'southatlantic', 'northatlantic']);
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

  describe('슬롯 효과', () => {
    const T0 = '2026-11-12T00:00:00.000Z';
    const at = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString();
    const slotRows = (g: GameState, now = T0) => selectActiveBonuses(g, null, now).filter(b => b.source.kind === 'slot');
    const text = (b: ReturnType<typeof slotRows>[number]) =>
      b.source.kind === 'slot'
        ? ('text' in b.source.effect ? b.source.effect.text : `${b.source.effect.label} ${b.source.effect.value}`)
        : '';

    it('효과가 든 슬롯은 요리 이름을 출처로 효과마다 한 줄, 갈래를 붙여 모은다', () => {
      const g = game({ slots: { lunch: { id: 'cook-lunch-bundle', endsAt: at(3_600_000) }, bait: null } });
      const rows = slotRows(g);
      expect(rows.map(b => [b.category, text(b)])).toEqual([
        ['fish', '입질 대기 −5%'], ['fish', '희귀 어종 출현 비중 +5%'], ['fish', '영웅 어종 출현 비중 +5%'], ['fish', '전설 어종 출현 비중 +5%'],
      ]);
      expect(rows.every(b => b.source.kind === 'slot' && b.source.label === '생선 탈리(전설)')).toBe(true);
    });

    it('네임드 조우 확률은 결투 갈래다', () => {
      const g = game({ slots: { lunch: { id: 'cook-lunch-named', endsAt: at(3_600_000) }, bait: null } });
      expect(slotRows(g).map(b => [b.category, text(b)])).toEqual([['duel', '네임드 조우 확률 +50%']]);
    });

    it('돌연변이 억제(키리바트·백단향 미끼)는 낚시 갈래의 ×0.5다', () => {
      const g = game({
        slots: {
          lunch: { id: 'cook-lunch-calm', endsAt: at(3_600_000) },
          bait: { id: 'cook-bait-calm', endsAt: at(300_000) },
        },
      });
      expect(slotRows(g).map(b => [b.category, b.autoOnly, b.manualOnly, text(b)])).toEqual([
        ['fish', true, false, '돌연변이 등장 ×0.5'],
        ['fish', false, true, '돌연변이 등장 ×0.5'],
      ]);
    });

    it('달빛 미끼의 비수치 효과는 낚시 갈래의 상세 설명 한 줄로 모은다', () => {
      const g = game({ slots: { lunch: null, bait: { id: 'cook-bait-night', endsAt: at(3_600_000) } } });
      expect(slotRows(g).map(b => [b.category, text(b)])).toEqual([['fish', '낮에도 밤 어종이 함께 낚여요.']]);
    });

    it('도시락은 방치로 낚을 때만, 미끼는 직접 챔질해 낚을 때만 붙는다고 표시한다', () => {
      const g = game({ slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(3_600_000) }, bait: { id: 'cook-bait-mutation', endsAt: at(60_000) } } });
      const [lunch, bait] = slotRows(g);
      expect([lunch.autoOnly, lunch.manualOnly]).toEqual([true, false]);
      expect([bait.autoOnly, bait.manualOnly]).toEqual([false, true]);
    });

    it('끝났거나 빈 슬롯은 줄을 내지 않는다', () => {
      expect(slotRows(game({}))).toEqual([]);
      const ended = game({ slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(0) }, bait: null } });
      expect(slotRows(ended)).toEqual([]);
    });

    it('유물과 길드 보너스 줄은 그대로고 슬롯 줄이 그 뒤에 온다', () => {
      const g = game({ artifacts: ['wreck-compass'], slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(3_600_000) }, bait: null } });
      expect(selectActiveBonuses(g, null, T0).map(b => b.source.kind)).toEqual(['relic', 'slot']);
    });
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

  it('누적 보너스 업적이 활성화되면 selectActiveBonuses와 selectStatsModalData에 업적 누적이 반영된다', () => {
    const g = game({
      boat: 1,
      rod: 10,
      achievementCounters: {
        'manual.total': 1_000,
        'sell.gold': 10_000_000,
        'named.flawless': 1,
      },
    });
    const bonuses = selectActiveBonuses(g);
    expect(bonuses.filter(b => b.source.kind === 'achievement').map(b => b.source)).toEqual([
      { kind: 'achievement', label: '입질 대기', value: '−4.8%' },
      { kind: 'achievement', label: '네임드 조우 확률', value: '+3%' },
      { kind: 'achievement', label: '판매가 보너스', value: '+1.2%' },
    ]);
    const data = selectStatsModalData(g, 'sail', 0);
    expect(data.effectiveBite.min.mods.some(m => m.id === 'achievement-biteWaitCut' && m.label === '업적 누적')).toBe(true);
  });

  it('보유 유물 효과 배율(artifactBoost)이 활성 유물 행 모두에 반영되고 낚시 갈래 단독 행으로 중복 분리하지 않는다', () => {
    // 전설 유물 1개(+2.5%) + 일반 유물 3개 Lv1(각 +0.5%) → artifactBoost +4% (scale = 1.04)
    const g = game({
      artifacts: ['mami-wata-mirror', 'wreck-compass', 'abyss-angler', 'outer-isle-sinker'],
    });
    const bonuses = selectActiveBonuses(g);
    const relics = bonuses.filter(b => b.source.kind === 'relic');
    expect(relics.map(b => [b.category, b.source.kind === 'relic' && b.source.artifact.id, b.source.kind === 'relic' && b.source.scale])).toEqual([
      ['duel', 'abyss-angler', 1.04],
      ['move', 'wreck-compass', 1.04],
      ['fish', 'outer-isle-sinker', 1.04],
    ]);
    // 낚시 갈래에만 따로 '보유 유물 효과' 행을 두지 않는다
    expect(bonuses.some(b => b.source.kind === 'achievement' && b.source.label === '보유 유물 효과')).toBe(false);
  });

  it('전설 유물만 있어 보유 유물 효과 배율이 올라가도 적용할 유물 효과가 없으면 보너스 줄이 비어 있다', () => {
    const g = game({ artifacts: ['mami-wata-mirror'] });
    expect(selectActiveBonuses(g)).toEqual([]);
  });

  it('다중 미끼가 켜지면 두 미끼 효과를 모두 내고, 같은 미끼 중복은 한 번만 낸다', () => {
    const now = '2026-11-12T00:00:00.000Z';
    const endsAt = '2026-11-12T00:02:30.000Z';
    const dual = game({
      boat: 5,
      artifacts: ['sargasso-net'],
      slots: {
        lunch: null,
        bait: { id: 'cook-bait-rare', endsAt },
        bait2: { id: 'cook-bait-mutation', endsAt },
      },
    });
    const rows = selectActiveBonuses(dual, null, now).filter(b => b.source.kind === 'slot');
    expect(rows.map(b => b.source.kind === 'slot'
      ? `${b.source.label}:${'text' in b.source.effect ? b.source.effect.text : b.source.effect.label}`
      : '')).toEqual([
      '롱페퍼 미끼(희귀):희귀 어종 출현 비중',
      '롱페퍼 미끼(희귀):영웅 어종 출현 비중',
      '롱페퍼 미끼(희귀):전설 어종 출현 비중',
      '사프란 미끼(특수):돌연변이 출현 비중',
    ]);

    const dup = game({
      boat: 5,
      artifacts: ['sargasso-net'],
      slots: {
        lunch: null,
        bait: { id: 'cook-bait-mutation', endsAt },
        bait2: { id: 'cook-bait-mutation', endsAt },
      },
    });
    expect(selectActiveBonuses(dup, null, now).filter(b => b.source.kind === 'slot')).toHaveLength(1);
  });

  it('오늘의 운세는 현재 게임 날짜와 일치할 때만 해당 대상 갈래에 한 줄로 든다', () => {
    const now = '2026-11-24T05:00:00.000Z';
    const fishRow = selectActiveBonuses(game({ fortune: { day: '2026-11-24', kind: 'fish', index: 5 } }), null, now);
    expect(fishRow).toEqual([{
      category: 'fish',
      source: { kind: 'fortune', fortune: { day: '2026-11-24', kind: 'fish', index: 5 } },
      manualOnly: false,
    }]);

    const goldRow = selectActiveBonuses(game({ fortune: { day: '2026-11-24', kind: 'gold', index: 3 } }), null, now);
    expect(goldRow.map(b => [b.category, b.source.kind])).toEqual([['shop', 'fortune']]);

    const shadowRow = selectActiveBonuses(game({ fortune: { day: '2026-11-24', kind: 'shadow', index: 5 } }), null, now);
    expect(shadowRow.map(b => [b.category, b.source.kind])).toEqual([['duel', 'fortune']]);

    const grandRow = selectActiveBonuses(game({ fortune: { day: '2026-11-24', kind: 'grand-catch', index: 5 } }), null, now);
    expect(grandRow.map(b => [b.category, b.source.kind])).toEqual([['fish', 'fortune'], ['shop', 'fortune'], ['duel', 'fortune']]);

    // 날짜가 지난 운세는 보너스 내역에서 빠진다
    const stale = selectActiveBonuses(game({ fortune: { day: '2026-11-23', kind: 'gold', index: 5 } }), null, now);
    expect(stale).toEqual([]);
  });

  it('오늘 사용한 비약은 낚시·결투·상점 갈래에 각각 ×1.05 곱연산 보너스로 들어간다', () => {
    const now = '2026-11-24T05:00:00.000Z';
    const active = selectActiveBonuses(game({ potions: { 'luck-small': '2026-11-24' } }), null, now);
    expect(active.map(b => [b.category, b.source.kind, b.source.kind === 'potion' ? b.source.target : null, b.source.kind === 'potion' ? b.source.bonus : null])).toEqual([
      ['fish', 'potion', 'rarity', 0.05],
      ['duel', 'potion', 'named', 0.05],
      ['shop', 'potion', 'sell', 0.05],
    ]);

    const stale = selectActiveBonuses(game({ potions: { 'luck-small': '2026-11-23' } }), null, now);
    expect(stale).toEqual([]);
  });

  describe('보너스 탭 통합 행 (selectBonusTableRows)', () => {
    const T0 = '2026-11-24T05:00:00.000Z';
    const at = (ms: number) => new Date(Date.parse(T0) + ms).toISOString();

    it('동일 효과를 1줄로 합산하고 구역 누적은 구역별 이름 대신 N곳으로 묶으며 합연산→곱연산 내림차순·최종 적용 순으로 툴팁을 정렬한다', () => {
      const pacFish = FISH.find(f => topZoneOfSpot(f.spot) === 'pacific')!;
      const seaFish = FISH.find(f => topZoneOfSpot(f.spot) === 'seasia')!;
      const g = game({
        artifacts: ['mami-wata-mirror', 'elder-scale'], // 전설 유물 1개 -> artifactBoost +2.5% (×1.025), 코모로 Lv1 +25%
        dex: {
          [pacFish.id]: { variant: { count: 50, maxSize: 10, first: '2026-11-24' } }, // +0.3%
          [seaFish.id]: { variant: { count: 50, maxSize: 10, first: '2026-11-24' } }, // +0.3%
        },
        achievementCounters: {
          'manual.variant.total': 10_000, // +7.5%
        },
      });
      const guild = {
        level: 10,
        effects: { sell: 0, bag: 0, named: 0, rare: 0, mutation: 0.4 },
      };
      const rows = selectBonusTableRows(g, guild, T0);
      const mutRow = rows.find(r => r.category === 'fish' && r.effect === '돌연변이 출현 비중' && r.scope === 'all')!;
      // 25% * 1.03 + 40% + 7.5% + 0.6% = 25.75 + 48.1 = 73.85%
      expect(mutRow.totalText).toBe('+73.85%');
      expect(mutRow.tipRows).toEqual([
        { label: '[길드] 돌연변이 확률', value: '+40%' },
        { label: '[유물] 코모로의 골판', value: '+25%' },
        { label: '[업적] 전체 돌연변이 손맛', value: '+7.5%' },
        { label: '[업적] 구역 돌연변이 2곳', value: '+0.6%' },
        { label: '[업적] 유물 증폭', value: '×1.03' },
        { label: '최종 적용', value: '+73.85%', divider: true },
      ]);
      // 구역 이름이 툴팁에 직접 나오지 않는다
      expect(mutRow.tipRows.some(r => String(r.label).includes('태평양') || String(r.label).includes('동남아'))).toBe(false);
    });

    it('운세와 비약은 독립 곱연산(1.10 × 1.05 = ×1.155)으로 합산하고 수동·방치 요리는 각각의 범위 배지와 증폭을 붙이며 억제 요리는 ×0.5로 낸다', () => {
      const g = game({
        boat: 5,
        artifacts: ['sargasso-net'],
        achievementCounters: {
          'catch.bait': 40,    // baitAmplify +6% (×1.06)
          'catch.lunch': 1000, // lunchAmplify +3% (×1.03)
          'energy.spent': 5000, // energyYield +3%
          'catch.auto': 5000,  // bagCap +1.5%
        },
        slots: {
          lunch: { id: 'cook-lunch-calm', endsAt: at(3_600_000) },
          bait: { id: 'cook-bait-mutation', endsAt: at(300_000) },
          bait2: { id: 'cook-bait-calm', endsAt: at(300_000) },
        },
        fortune: { day: '2026-11-24', kind: 'fish', index: 5 },
        potions: { 'luck-small': '2026-11-24' },
      });
      const rows = selectBonusTableRows(g, null, T0);

      const rareLuck = rows.find(r => r.effect === '희귀 이상 출현 비중' && r.totalText.startsWith('×'))!;
      expect(rareLuck.scope).toBe('all');
      expect(rareLuck.totalText).toBe('×1.155');
      expect(rareLuck.tipRows).toEqual([
        { label: '[운세] 만선 풍어운', value: '×1.10' },
        { label: '[비약] 작은 바다 영약', value: '×1.05' },
        { label: '최종 적용', value: '×1.155', divider: true },
      ]);

      const baitMut = rows.find(r => r.effect === '돌연변이 출현 비중' && r.scope === 'manual')!;
      // +150% * 1.06 = +159%
      expect(baitMut.totalText).toBe('+159%');
      expect(baitMut.tipRows).toEqual([
        { label: '[미끼] 사프란 미끼', value: '+150%' },
        { label: '[업적] 미끼 손맛 증폭', value: '×1.06' },
        { label: '최종 적용', value: '+159%', divider: true },
      ]);

      const calmBait = rows.find(r => r.effect === '돌연변이 등장' && r.scope === 'manual')!;
      expect(calmBait.totalText).toBe('×0.5');
      expect(calmBait.tipRows).toEqual([
        { label: '[미끼] 백단향 미끼', value: '×0.5' },
        { label: '최종 적용', value: '×0.5', divider: true },
      ]);

      const calmLunch = rows.find(r => r.effect === '돌연변이 등장' && r.scope === 'auto')!;
      expect(calmLunch.totalText).toBe('×0.5');
      expect(calmLunch.tipRows).toEqual([
        { label: '[도시락] 키리바트', value: '×0.5' },
        { label: '최종 적용', value: '×0.5', divider: true },
      ]);

      expect(rows.find(r => r.effect === '기운 획득량')?.totalText).toBe('+3%');
      expect(rows.find(r => r.effect === '가방 용량')?.totalText).toBe('+1.5%');
    });

    it('신규 운세 10개 보너스 채널(입질 대기·월척·명성·돌연변이·밤·기운·전설·복합 대길)이 보너스 탭에 반영된다', () => {
      const mirageRows = selectBonusTableRows(game({ fortune: { day: '2026-11-24', kind: 'mirage', index: 5 } }), null, T0);
      expect(mirageRows.find(r => r.effect === '전설 출현 비중')?.tipRows[0]).toEqual({ label: '[운세] 신기루 운', value: '×1.08' });
      expect(mirageRows.find(r => r.effect === '돌연변이 출현 비중')?.tipRows[0]).toEqual({ label: '[운세] 신기루 운', value: '×1.08' });

      const biteRows = selectBonusTableRows(game({ fortune: { day: '2026-11-24', kind: 'bite', index: 3 } }), null, T0);
      expect(biteRows.find(r => r.effect === '입질 대기')?.totalText).toBe('×0.95');

      const bigRows = selectBonusTableRows(game({ fortune: { day: '2026-11-24', kind: 'big', index: 5 } }), null, T0);
      expect(bigRows.find(r => r.effect === '월척 출현 확률')?.totalText).toBe('×2');

      const fameRows = selectBonusTableRows(game({ fortune: { day: '2026-11-24', kind: 'fame', index: 3 } }), null, T0);
      expect(fameRows.find(r => r.effect === '명성 획득')?.totalText).toBe('×1.50');

      const nightRows = selectBonusTableRows(game({ fortune: { day: '2026-11-24', kind: 'night', index: 5 } }), null, T0);
      expect(nightRows.find(r => r.effect === '밤 어종 출현 비중')?.totalText).toBe('×1.10');

      const energyRows = selectBonusTableRows(game({ fortune: { day: '2026-11-24', kind: 'energy', index: 3 } }), null, T0);
      expect(energyRows.find(r => r.effect === '생명의 기운 획득량')?.totalText).toBe('×1.50');
    });
  });
});
