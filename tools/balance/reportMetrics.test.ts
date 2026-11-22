import { describe, expect, it } from 'vitest';
import { BOATS } from '../../src/game/content/boats';
import { BOUNTY_ZONES } from '../../src/game/content/bounties';
import { RARITY_ORDER } from '../../src/game/content/rarity';
import { SPOTS } from '../../src/game/content/spots';
import { SPEC_MARGIN, ZONE_ORDER, entryLevel } from './model';
import {
  PLAYS, bountyMetrics, dexMetrics, economyMetrics, evMetrics, fameGateTimes,
  growthMetrics, idleMetrics, incomeMetrics, journeyMetrics, manualAxis,
  monotonicMetrics, moveMetrics, perfectMetrics, playAxis, rodCum, rodSpecMetrics,
} from './reportMetrics';

describe('누적 강화비와 축 선택', () => {
  it('rodCum은 1 이하에서 0이고 레벨이 오르면 엄격히 단조 증가한다', () => {
    expect(rodCum(0)).toBe(0);
    expect(rodCum(1)).toBe(0);
    for (let lv = 2; lv <= 30; lv++) {
      expect(rodCum(lv)).toBeGreaterThan(rodCum(lv - 1));
    }
  });

  it('playAxis는 방치일 때 idle을, 수동일 때 manualAxis를 돌려준다', () => {
    for (const s of SPOTS) {
      expect(playAxis(s.id, 'idle')).toBe('idle');
      expect(playAxis(s.id, 'manual')).toBe(manualAxis(s.id));
      expect(['good', 'normal']).toContain(manualAxis(s.id));
    }
  });
});

describe('기대값·스펙·수입·방치 지표', () => {
  it('evMetrics는 해역 수만큼 행을 내고 등급 비율 합은 100%다', () => {
    const ev = evMetrics();
    expect(ev.rows).toHaveLength(SPOTS.length);
    expect(ev.rows[0].deltaGoldPct).toBeNull();
    expect(ev.rarityShares).toHaveLength(SPOTS.length);
    for (const s of ev.rarityShares) {
      for (const a of s.axes) {
        expect(a.shares).toHaveLength(RARITY_ORDER.length);
        const total = a.shares.reduce((sum, v) => sum + v, 0);
        expect(total).toBeCloseTo(100, 6);
      }
    }
  });

  it('rodSpecMetrics는 해역×여유 단계 수만큼 행을 낸다', () => {
    const rows = rodSpecMetrics();
    expect(rows).toHaveLength(SPOTS.length * 2);
    for (const r of rows) expect(r.spec.level).toBe(entryLevel(r.spot) + r.margin);
  });

  it('incomeMetrics는 각 여유 표와 지역 수-1개의 지역 간 배율을 낸다', () => {
    const inc = incomeMetrics();
    expect(inc.tables.map(t => t.margin)).toEqual([0, SPEC_MARGIN]);
    for (const t of inc.tables) {
      expect(t.rows).toHaveLength(SPOTS.length);
      for (const r of t.rows) {
        expect(r.ratios.gold).toBeGreaterThan(1);
        expect(r.ratios.fame).toBeGreaterThan(1);
      }
    }
    expect(inc.zoneMultipliers).toHaveLength(ZONE_ORDER.length - 1);
    for (const z of inc.zoneMultipliers) {
      expect(z.ratios.idle).toBeGreaterThan(0);
      expect(z.ratios.manual).toBeGreaterThan(0);
    }
  });

  it('idleMetrics는 진입과 플래토의 방치 배수·수입이 양수다', () => {
    const rows = idleMetrics();
    expect(rows).toHaveLength(SPOTS.length);
    for (const r of rows) {
      expect(r.levels[1]).toBe(r.levels[0] + SPEC_MARGIN);
      expect(r.goldPerHourMixed[1]).toBeGreaterThan(r.goldPerHourMixed[0]);
    }
  });
});

describe('이동 직후·PERFECT·진입 비용·여정', () => {
  it('moveMetrics는 첫 해역을 뺀 모든 전환과 최악 비율을 낸다', () => {
    const mv = moveMetrics();
    expect(mv.rows).toHaveLength(SPOTS.length - 1);
    expect(Number.isFinite(mv.worst.day)).toBe(true);
    expect(Number.isFinite(mv.worst.mixed)).toBe(true);
    for (const r of mv.rows) {
      expect(r.day.diff).toBeCloseTo(r.day.gold - r.day.fromGold, 6);
      expect(r.mixed.diff).toBeCloseTo(r.mixed.gold - r.mixed.fromGold, 6);
    }
  });

  it('perfectMetrics의 최댓값은 모든 행의 최소·여유 값 이상이다', () => {
    const pf = perfectMetrics();
    expect(pf.rows).toHaveLength(SPOTS.length);
    for (const r of pf.rows) {
      expect(r.min).toBeGreaterThan(1);
      expect(r.margin).toBeGreaterThan(1);
      expect(pf.max.value).toBeGreaterThanOrEqual(r.min);
      expect(pf.max.value).toBeGreaterThanOrEqual(r.margin);
    }
  });

  it('growthMetrics는 해역 전환마다 양수 비용과 양수 소요 시간을 낸다', () => {
    const g = growthMetrics([1, 5, 10]);
    expect(g.transitions).toHaveLength(SPOTS.length - 1);
    expect(g.upgradeSamples.map(x => x.level)).toEqual([1, 5, 10]);
    for (const t of g.transitions) {
      expect(t.gold).toBe(t.boatPrice + t.rodCost);
      expect(t.gold).toBeGreaterThan(0);
      expect(t.hours.idle).toBeGreaterThan(t.hours.manual);
    }
  });

  it('journeyMetrics는 모든 해역 도착과 지역 첫 도착을 낸다', () => {
    const jm = journeyMetrics();
    for (const p of PLAYS) {
      expect(jm[p].journey.arrivals).toHaveLength(SPOTS.length);
      expect(jm[p].zoneFirsts.map(z => z.zone)).toEqual(ZONE_ORDER);
    }
  });
});

describe('명성 문턱·단조성·경제·수집·도전', () => {
  it('fameGateTimes는 명성 조건이 있는 배 수만큼 길이를 갖고 누적 시간이 단조 증가한다', () => {
    const gateCount = BOATS.filter(b => b.fameReq > 0).length;
    const res = fameGateTimes();
    expect(res.map(r => r.play)).toEqual([...PLAYS]);
    for (const r of res) {
      expect(r.gates).toHaveLength(gateCount);
      for (let i = 1; i < r.gates.length; i++) {
        expect(r.gates[i].fame).toBeGreaterThanOrEqual(r.gates[i - 1].fame);
        expect(r.gates[i].hours).toBeGreaterThan(r.gates[i - 1].hours);
      }
    }
  });

  it('monotonicMetrics는 여유×플레이 조합별 완화 여유를 해역 수-1개씩 낸다', () => {
    const rows = monotonicMetrics();
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.headrooms).toHaveLength(SPOTS.length - 1);
    }
  });

  it('economyMetrics는 해역별 1단계 강화 시간과 최종 해역 여유별 강화 시간을 낸다', () => {
    const eco = economyMetrics();
    expect(eco.upgradeTimes).toHaveLength(SPOTS.length);
    expect(eco.endgameUpgrades).toHaveLength(2);
    expect(eco.lastBoatHours.idle).not.toBeNull();
    expect(eco.lastBoatHours.manual).not.toBeNull();
    expect(eco.endgameUpgrades[1].level).toBe(eco.endgameUpgrades[0].level + SPEC_MARGIN);
  });

  it('dexMetrics는 구역 수만큼 내고 같은 시드면 재현되며 잘못된 runs는 거부한다', () => {
    const a = dexMetrics(3, 123);
    const b = dexMetrics(3, 123);
    expect(a).toEqual(b);
    expect(a.map(z => z.zone)).toEqual(ZONE_ORDER);
    for (const z of a) {
      for (const p of PLAYS) {
        const s = z.byPlay[p];
        expect(s.all.mean).toBeGreaterThanOrEqual(s.noLegend.mean);
        expect(s.variant.mean).toBeGreaterThan(0);
      }
    }
    expect(() => dexMetrics(0, 123)).toThrow();
  });

  it('bountyMetrics는 바운티 구역별 네임드 조우 시간과 의뢰 보상을 낸다', () => {
    const rows = bountyMetrics();
    expect(rows.map(r => r.zone)).toEqual([...BOUNTY_ZONES]);
    for (const r of rows) {
      expect(r.encounterHours.idle).toBeGreaterThan(0);
      expect(r.encounterHours.manual).toBeGreaterThan(0);
      expect(r.quests.length).toBeGreaterThan(0);
    }
  });
});
