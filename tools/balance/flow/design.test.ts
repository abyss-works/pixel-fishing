import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOATS } from '../../../src/game/content/boats';
import { FISH } from '../../../src/game/content/fish';
import { rodStats } from '../../../src/game/rules/logic';
import { SPOTS } from '../../../src/game/content/spots';
import { upgradeCost } from '../../../src/game/rules/balance';
import { IDLE_BOOST_STEPS } from '../../../src/game/rules/power';
import { entryLevel, rates, rodSpec } from '../model';
import { applyOverride, parseOverride } from './override';
import { addPerSpot, designReport, judgeReversal, parseAnchor, parseGrade, parseNight } from './design';
import type { DesignInput, DesignReport } from './design';
import { biteRangeOf } from '../rodRules';
import { runCli } from './report';
import { transitionReport } from './transitions';

const empty = { all: null, by: {} } as const;
const base = (o: Partial<DesignInput> = {}): DesignInput => ({
  start: 25, growth: 0.15, gap: { all: 5, by: {} }, hours: { all: 3, by: {} }, payback: null, boatShare: 0,
  grades: {}, night: {}, anchors: [], bite: 'both', solve: null, maxDays: 365, ...o,
});
const STH = SPOTS.findIndex(s => s.id === 'sthelena');
const LAST = SPOTS.length - 1;
const fishPrice = (id: string) => FISH.find(f => f.id === id)!.price;
/** 제품 상수의 전체 스냅샷 — 계산이 끝나도 같은 값인지 견주는 데 쓴다. 어떤 계산보다 먼저 이 모듈을 읽을 때 잡는다 */
const snapshot = () => JSON.stringify({
  cost: [1, 5, 20, 60].map(upgradeCost), spots: SPOTS.map(x => x.powerReq), fish: FISH.map(f => f.price),
  boats: BOATS.map(b => [b.price, b.fameReq]), idle: IDLE_BOOST_STEPS,
});
const BEFORE_ANY_RUN = snapshot();

describe('design 입력 해석', () => {
  it('값 하나는 기본값이고 해역=값은 그 해역만 바꾼다', () => {
    const p = { all: null as number | null, by: {} as Record<string, number> };
    addPerSpot(p, '--gap', '5');
    addPerSpot(p, '--gap', 'sea=4');
    expect(p).toEqual({ all: 5, by: { sea: 4 } });
    expect(() => addPerSpot(p, '--gap', 'nowhere=4')).toThrow(/없는 해역/);
    expect(() => addPerSpot(p, '--gap', 'sea=x')).toThrow(/숫자/);
    expect(() => addPerSpot(p, '--gap', 'x')).toThrow(/숫자/);
  });

  it('등급, 밤 배율, 기준점 형식을 검사한다', () => {
    expect(parseGrade('희귀=1.5:1.03')).toEqual({ grade: 'rare', curve: { base: 1.5, step: 1.03 } });
    expect(parseGrade('legendary=4')).toEqual({ grade: 'legendary', curve: { base: 4, step: 1 } });
    expect(() => parseGrade('일반=2:1')).toThrow(/등급/);
    expect(() => parseGrade('희귀=0:1')).toThrow(/0보다/);
    expect(parseNight('영웅=1.7')).toEqual({ grade: 'epic', mult: 1.7 });
    expect(() => parseNight('영웅')).toThrow(/형식/);
    expect(parseAnchor('sthelena=942,379')).toEqual({ spot: 'sthelena', ev: 942379 });
    expect(() => parseAnchor('sthelena=-1')).toThrow(/형식/);
    expect(() => parseAnchor('nowhere=5')).toThrow(/없는 해역/);
  });
});

describe('design 계산', () => {
  let r: DesignReport;
  beforeAll(() => { r = designReport(base({ boatShare: 0.15, hours: { all: 3, by: { river: 2 } } })); }, 60_000);

  it('진입 레벨은 첫 해역 1에서 간격만큼 올라가고 요구 파워는 그 레벨의 파워다', () => {
    expect(r.rows.map(x => x.level)).toEqual(SPOTS.map((_, i) => 1 + 5 * i));
    expect(r.rows[1].power).toBe(r.rows[0].power + 5 * 5);
    expect(r.rows.at(-1)!.gap).toBeNull();
  });

  it('필요 진입 EV는 (구간 강화비 합 + 배 가격) ÷ H이고 구간 강화비는 단일 지수 곡선의 합이다', () => {
    const undo = applyOverride({ rod: { costBase: 25, costGrowth: 1.15, costPowerFrom: 1_000_000 } });
    try {
      const expectSum = (from: number) => [0, 1, 2, 3, 4].reduce((s, k) => s + upgradeCost(from + k), 0);
      r.rows.slice(0, -1).forEach(x => {
        expect(x.upgradeSum).toBeCloseTo(expectSum(x.level), 6);
        const h = x.spot === 'river' ? 2 : 3;
        expect(x.requiredEv).toBeCloseTo((x.upgradeSum! + x.boatPrice!) / h, 6);
        expect(x.hours).toBe(h);
      });
      expect(upgradeCost(1)).toBe(25);
    } finally { undo(); }
  });

  it('배 가격은 전환 골드의 비중이고 새로 사는 배가 없는 구간은 0이다', () => {
    r.rows.slice(0, -1).forEach((x, i) => {
      const boats = SPOTS[i + 1].boatTier > SPOTS[i].boatTier;
      if (!boats) expect(x.boatPrice).toBe(0);
      else expect(x.boatPrice! / (x.boatPrice! + x.upgradeSum!)).toBeCloseTo(0.15, 9);
    });
    const tiers = Object.values(r.override.boats!);
    expect(tiers.every(b => b.fameReq === 0)).toBe(true);
  });

  it('등급 비율을 바꾸지 않으면 가격 배율은 필요 EV ÷ 현재 EV이고 몫의 합은 1이다', () => {
    for (const x of r.rows) {
      expect(x.priceMult).toBeCloseTo(x.evRatio, 9);
      const sum = Object.values(x.grades).reduce((s, c) => s + (c?.evShare ?? 0), 0);
      expect(sum).toBeCloseTo(1, 9);
    }
  });

  it('역전 검사는 앞 해역의 다음 해역 진입 직전 레벨을 잰다', () => {
    expect(r.reversals).toHaveLength(SPOTS.length - 1);
    r.reversals.forEach((x, i) => {
      expect(x.level).toBe(r.rows[i + 1].level - 1);
      expect(x.reversed).toBe(x.ev > x.nextEv);
    });
    const plateau = (steps: readonly number[]) => steps.indexOf(steps.at(-1)!);
    expect(r.boostEnd).toBe(plateau(IDLE_BOOST_STEPS));
  });

  it('방치 이득을 뺀 앞 해역 EV는 방치 배수를 앞 해역 진입 레벨의 값으로 고정해 잰다', () => {
    const undo = applyOverride(r.override);
    try {
      r.reversals.forEach((x, i) => {
        const boost = rodSpec(x.spot, r.rows[i].level).idleBoost;
        expect(r.rows[i].entryBoost).toBe(boost);
        expect(x.evNoBoost).toBeCloseTo(rates(x.spot, x.level, 'idle', { commonMult: boost }).goldPerHour, 9);
        expect(x.evNoBoost).toBeLessThanOrEqual(x.ev + 1e-9);
        expect(x.reversedNoBoost).toBe(x.evNoBoost > x.nextEv);
      });
      expect(r.rows[LAST].entryBoost).toBe(rodSpec(SPOTS[LAST].id, r.rows[LAST].level).idleBoost);
    } finally { undo(); }
    expect(r.reversals.some(x => x.evNoBoost < x.ev)).toBe(true);
  });

  it('역전 판정은 경계에서 정상, 허용, 역전을 가른다', () => {
    expect(judgeReversal(100, 100, 0)).toBe('normal');
    expect(judgeReversal(100.0001, 100, 0)).toBe('reversed');
    expect(judgeReversal(99, 100, 0.5)).toBe('normal');
    expect(judgeReversal(100, 100, 0.5)).toBe('normal');
    expect(judgeReversal(100.0001, 100, 0.5)).toBe('tolerated');
    expect(judgeReversal(150, 100, 0.5)).toBe('tolerated');
    expect(judgeReversal(150.0001, 100, 0.5)).toBe('reversed');
  });

  it('허용폭 0의 판정은 앞 해역 EV가 다음 해역 진입 EV보다 큰지와 같다', () => {
    const same = designReport(base({ boatShare: 0.15, hours: { all: 3, by: { river: 2 } } }));
    same.reversals.forEach(x => {
      expect(x.reversed).toBe(x.ev > x.nextEv);
      expect(x.reversedNoBoost).toBe(x.evNoBoost > x.nextEv);
      expect(x.tolerated || x.toleratedNoBoost).toBe(false);
    });
  }, 60_000);

  it('허용폭을 주면 같은 설정의 허용폭 0 결과와 EV는 같고 판정만 갈린다', () => {
    const input = { boatShare: 0.15, hours: { all: 3, by: { river: 2 } } };
    const strict = designReport(base(input)), wide = designReport(base({ ...input, reversalTolerance: 0.2 }));
    wide.reversals.forEach((x, i) => {
      expect(x.ev).toBe(strict.reversals[i].ev);
      expect(x.evNoBoost).toBe(strict.reversals[i].evNoBoost);
      expect(x.reversed).toBe(x.ev > x.nextEv * 1.2);
      expect(x.tolerated).toBe(x.ev > x.nextEv && x.ev <= x.nextEv * 1.2);
      expect(x.reversedNoBoost).toBe(x.evNoBoost > x.nextEv * 1.2);
      expect(x.toleratedNoBoost).toBe(x.evNoBoost > x.nextEv && x.evNoBoost <= x.nextEv * 1.2);
    });
    expect(() => designReport(base({ reversalTolerance: -0.1 }))).toThrow(/허용폭/);
  }, 60_000);

  describe('표 행 단위 출력', () => {
    const GAPS = ['pond=2', 'river=3', 'sea=4', 'deep=3', 'dragonhole=3', 'coron=3', 'barrierreef=5', 'indian=5', 'southindian=5', 'mozstrait=5', 'comorodeep=6', 'benguela=6'];
    const PAYBACKS = ['pond=0.016667', 'river=0.016667', 'sea=0.05', 'deep=0.1', 'dragonhole=0.166667', 'coron=0.233333', 'barrierreef=0.3', 'indian=0.5', 'southindian=0.7', 'mozstrait=1.25', 'comorodeep=1.666667', 'benguela=2.5'];
    const args = ['design', '--start', '100', '--growth', '0.25', '--bite', 'alternate', '--max-days', '2', ...GAPS.flatMap(g => ['--gap', g]), ...PAYBACKS.flatMap(g => ['--payback', g])];
    const run = (tol: number) => {
      const a = tol > 0 ? [...args, '--reversal-tolerance', String(tol)] : args;
      const text = runCli(a).stdout;
      const json = JSON.parse(runCli([...a, '--json']).stdout).design as DesignReport;
      return { text, json };
    };
    const cellsOf = (text: string, title: string, first: string) => {
      const section = text.slice(text.indexOf(title));
      const line = section.split('\n').find(l => l.startsWith(`| ${first} |`));
      expect(line).toBeDefined();
      return line!.split('|').slice(1, -1).map(c => c.trim());
    };
    const name = (id: string) => SPOTS.find(s => s.id === id)!.name;
    const word = (v: string) => (v === 'reversed' ? '역전' : v === 'tolerated' ? '허용' : '정상');
    const n0 = (x: number) => Math.round(x).toLocaleString('en-US');
    // 허용폭 0.2와 0.6에서 표 2 모든 행의 판정 칸과 방치 이득 제외 칸이 데이터에서 계산한 값과 같다
    it.each([0, 0.2, 0.6])('허용폭 %s에서 표 2의 모든 칸이 계산 값과 같다', tol => {
      const { text, json } = run(tol);
      const seen = new Set<string>();
      json.reversals.forEach(x => {
        const c = cellsOf(text, '표 2 —', `${name(x.spot)} → ${name(x.next)}`);
        const v = judgeReversal(x.ev, x.nextEv, tol), vb = judgeReversal(x.evNoBoost, x.nextEv, tol);
        expect(c[3]).toBe((x.ev / x.nextEv).toFixed(2));
        expect(c[4]).toBe(word(v));
        expect(c[5]).toBe(n0(x.evNoBoost));
        expect(c[6]).toBe((x.evNoBoost / x.nextEv).toFixed(2));
        expect(c[7]).toBe(word(vb));
        seen.add(`판정 ${c[4]}`); seen.add(`제외 ${c[7]}`);
      });
      if (tol === 0) { expect(seen.has('판정 허용') || seen.has('제외 허용')).toBe(false); return; }
      expect(seen.has('판정 허용')).toBe(true);
      expect(seen.has('판정 정상')).toBe(true);
      expect(seen.has('제외 정상')).toBe(true);
      if (tol === 0.6) {
        expect(seen.has('판정 역전')).toBe(true);
        expect(seen.has('제외 허용')).toBe(true);
      }
    }, 120_000);

    it('허용 상한은 두 자리로 줄이면 값이 달라질 때 원래 값으로 적는다', () => {
      expect(run(0.035).text).toContain('1 초과 1.035 이하이면 허용');
    }, 120_000);

    it('방치 이득 제외 칸은 허용폭과 관계없이 방치 이득이 든 칸과 다르다', () => {
      const { json } = run(0);
      expect(json.reversals.some(x => x.evNoBoost < x.ev)).toBe(true);
    }, 60_000);

    it('표 1의 진입 레벨 방치 배수 칸은 해역 행의 값이다', () => {
      const { text, json } = run(0);
      const head = text.slice(text.indexOf('표 1 —')).split('\n').find(l => l.startsWith('| 해역 |'))!.split('|').slice(1, -1).map(c => c.trim());
      const col = head.indexOf('진입 레벨 방치 배수');
      expect(col).toBeGreaterThan(0);
      json.rows.forEach(r => expect(cellsOf(text, '표 1 —', name(r.spot))[col]).toBe(`${r.entryBoost}배`));
      expect(new Set(json.rows.map(r => r.entryBoost))).toEqual(new Set([IDLE_BOOST_STEPS[0]]));
    }, 60_000);

    it('허용폭이 0보다 클 때만 가정 줄에 판정 기준을 적는다', () => {
      expect(run(0).text).not.toContain('허용폭');
      expect(run(0.2).text).toContain('1 초과 1.20 이하이면 허용');
    }, 120_000);
  });

  describe('해역 배수 공식', () => {
    const f = { factors: { normalEntry: 1.75, normalIn: 1.2, specialEntry: 1.45, specialIn: 1.3 }, scale: 1, special: [] as string[], start: 0.02 };
    const hbase = (o: Partial<DesignInput> = {}) => base({ hours: null, payback: { base: null, growth: 0, by: {} }, gap: { all: 3, by: {} }, anchors: [], hFormula: f, ...o });
    const ratios = (r: DesignReport) => r.rows.map(x => x.hRatio);
    it('지역 첫 해역은 진입 배수, 그 밖은 지역 안 배수이고 특수 지역은 특수 배수를 쓴다', () => {
      const r = designReport(hbase({ hFormula: { ...f, scale: 1.25, special: ['seasia', 'southatlantic'] } }));
      expect(r.rows[0].hRatio).toBeNull();
      r.rows.forEach((x, i) => {
        if (i === 0) return;
        const entry = SPOTS[i].region !== SPOTS[i - 1].region, special = ['seasia', 'southatlantic'].includes(SPOTS[i].region);
        const factor = special ? (entry ? 1.45 : 1.3) : entry ? 1.75 : 1.2;
        expect(x.hRatio).toBeCloseTo(factor * 1.25, 9);
        expect(x.payback).toBeCloseTo(r.rows[i - 1].payback! * factor * 1.25, 9);
      });
      expect(r.rows[0].payback).toBe(0.02);
      expect(r.resolved.payback).toBe(0.02);
    }, 60_000);

    it('특수 지역을 주지 않으면 모두 일반 배수다', () => {
      const r = designReport(hbase());
      expect(ratios(r).slice(1).every(x => Math.abs(x! - 1.75) < 1e-9 || Math.abs(x! - 1.2) < 1e-9)).toBe(true);
    }, 60_000);

    it('연못 h를 생략하면 기준점 EV를 맞추도록 풀고 기준점 오차가 0이다', () => {
      const probe = designReport(hbase());
      const anchor = { spot: 'sthelena' as const, ev: probe.rows[LAST].requiredEv * 1.7 };
      const r = designReport(hbase({ hFormula: { ...f, start: null }, anchors: [anchor] }));
      expect(r.rows[LAST].requiredEv).toBeCloseTo(anchor.ev, 6);
      expect(r.anchors[0].error).toBeCloseTo(0, 9);
      expect(r.resolved.payback).toBeCloseTo(0.02 / 1.7, 9);
    }, 60_000);

    it('연못 h와 기준점을 함께 주면 기준점 오차를 낸다', () => {
      const r = designReport(hbase({ anchors: [{ spot: 'sthelena', ev: 1_000_000 }] }));
      expect(r.anchors).toHaveLength(1);
      expect(Math.abs(r.anchors[0].error)).toBeGreaterThan(0);
      expect(r.rows[0].payback).toBe(0.02);
      expect(r.resolved.payback).toBe(0.02);
    }, 60_000);

    it('해역별 --payback 덮어쓰기는 공식 뒤에 적용하고 다음 해역 h는 공식 값에서 이어진다', () => {
      const plain = designReport(hbase());
      const r = designReport(hbase({ payback: { base: null, growth: 0, by: { sea: 0.5 } } }));
      const i = SPOTS.findIndex(s => s.id === 'sea');
      expect(r.rows[i].payback).toBe(0.5);
      expect(r.rows[i + 1].payback).toBeCloseTo(plain.rows[i + 1].payback!, 12);
      expect(r.rows[i].hRatio).toBeCloseTo(0.5 / plain.rows[i - 1].payback!, 12);
    }, 60_000);

    it('입력이 모순이거나 모자라면 거부한다', () => {
      expect(() => designReport(hbase({ hFormula: { ...f, start: null } }))).toThrow(/기준점/);
      expect(() => designReport(hbase({ hFormula: { ...f, factors: { normalEntry: 1.5 } } }))).toThrow(/normal-in/);
      expect(() => designReport(hbase({ hFormula: { ...f, special: ['nowhere'] } }))).toThrow(/지역/);
      expect(() => designReport(hbase({ hFormula: { ...f, scale: 0 } }))).toThrow(/h-scale/);
      expect(() => designReport(hbase({ payback: { base: 0.5, growth: 0, by: {} } }))).toThrow(/함께/);
      expect(() => designReport(hbase({ payback: { base: null, growth: 0.1, by: {} } }))).toThrow(/payback-growth/);
      const anchor = { spot: 'sthelena' as const, ev: 1_000_000 };
      expect(() => designReport(hbase({ hFormula: { ...f, start: null }, anchors: [anchor], payback: { base: null, growth: 0, by: { sthelena: 5 } } }))).toThrow(/기준점/);
      expect(designReport(hbase({ anchors: [anchor], payback: { base: null, growth: 0, by: { sthelena: 5 } } })).rows[LAST].payback).toBe(5);
      expect(() => designReport(hbase({ hFormula: { ...f, factors: { normalEntry: 1.5 } } }))).toThrow(/--h-factor normal-in/);
      expect(() => designReport(hbase({ hFormula: { ...f, factors: { ...f.factors, specialIn: 0 }, special: ['seasia'] } }))).toThrow(/special-in/);
    });

    it('CLI는 인자를 읽어 표 1에 h 배수 열을 낸다', () => {
      const a = ['design', '--start', '100', '--growth', '0.25', '--max-days', '2', '--gap', '3', '--h-start', '0.02',
        '--h-factor', 'normal-entry=1.75', '--h-factor', 'normal-in=1.2', '--h-factor', 'special-entry=1.45', '--h-factor', 'special-in=1.3',
        '--special-region', 'seasia', '--h-scale', '1.25'];
      const out = runCli(a);
      expect(out.exitCode).toBe(0);
      const sea = out.stdout.slice(out.stdout.indexOf('표 1 —')).split('\n').find(l => l.startsWith('| 태평양 |'))!;
      expect(sea).toContain('2.188배');
      expect(out.stdout).toContain('h 배수(앞 해역 대비)');
      expect(out.stdout).not.toContain('## 비용 기준 역산 — 기준점 오차');
      expect(runCli([...a, '--anchor', 'sthelena=1000000']).stdout).toContain('## 비용 기준 역산 — 기준점 오차');
      expect(runCli(a.filter(x => x !== '--h-start' && x !== '0.02').concat(['--anchor', 'none'])).exitCode).toBe(1);
      expect(runCli([...a, '--h-factor', 'normal-in=2']).exitCode).toBe(1);
      expect(runCli([...a, '--special-region', 'seasia']).exitCode).toBe(1);
      expect(runCli([...a, '--payback-growth', '0']).stderr).toMatch(/payback-growth/);
      expect(runCli([...a.slice(0, -2), '--h-factor', 'bogus=2']).exitCode).toBe(1);
      expect(runCli(['transition', '--h-start', '1']).exitCode).toBe(1);
    }, 120_000);
  });

  it('--reversal-tolerance는 design에서만 0 이상의 숫자를 받는다', () => {
    const a = ['design', '--start', '25', '--growth', '0.15', '--gap', '5', '--hours', '3'];
    expect(runCli([...a, '--reversal-tolerance', 'x']).exitCode).toBe(1);
    expect(runCli([...a, '--reversal-tolerance', '-1']).exitCode).toBe(1);
    expect(runCli(['transition', '--reversal-tolerance', '0.2']).stderr).toMatch(/design/);
  });

  it('계산을 마치면 제품 상수가 계산 전 값으로 돌아온다', () => {
    designReport(base({ gap: { all: 4, by: {} }, hours: { all: 2, by: {} }, grades: { rare: { base: 5, step: 1.02 } }, night: { epic: 1.4 }, boatShare: 0.1 }));
    designReport(base({ hours: null, payback: { base: 0.5, growth: 0.01, by: {} }, solve: null }));
    expect(snapshot()).toBe(BEFORE_ANY_RUN);
  }, 60_000);
});

describe('design 등급 가격 비율', () => {
  let r: DesignReport, plain: DesignReport;
  beforeAll(() => {
    plain = designReport(base());
    r = designReport(base({ grades: { rare: { base: 5, step: 1.02 }, legendary: { base: 100, step: 1.05 } }, night: { legendary: 1.5, epic: 1.4 } }));
  }, 60_000);

  it('EV 목표는 그대로이고 일반 가격이 차이를 흡수한다', () => {
    r.rows.forEach((x, i) => {
      expect(x.requiredEv).toBeCloseTo(plain.rows[i].requiredEv, 6);
      expect(Object.values(x.grades).reduce((s, c) => s + (c?.evShare ?? 0), 0)).toBeCloseTo(1, 9);
    });
    expect(r.rows[STH].priceMult).not.toBeCloseTo(plain.rows[STH].priceMult, 3);
    expect(r.rows[STH].priceMult).toBeGreaterThan(0);
    // 덮어쓰기를 적용해 잰 EV도 같은 목표에 가깝다(가격 사다리 반올림 범위)
    expect(Math.abs(r.rows[STH].achievedEv / r.rows[STH].requiredEv - 1)).toBeLessThan(0.05);
  });

  it('일반 최대가 대비 낮 어종 최대가가 base x step^순번이고 밤 어종은 낮 어종 x 밤 배율이다', () => {
    const c = r.rows[STH].grades;
    expect(c.rare!.ratio).toBeCloseTo(5 * 1.02 ** STH, 9);
    expect(c.legendary!.ratio).toBeCloseTo(100 * 1.05 ** STH, 9);
    expect(c.legendary!.nightRatio! / c.legendary!.ratio!).toBeCloseTo(1.5, 9);
    expect(c.epic!.nightRatio! / c.epic!.ratio!).toBeCloseTo(1.4, 9);
  });

  it('등급 배율과 밤 배율을 함께 줘도 덮어쓰기를 적용한 뒤 밤 낮 비율이 지정값과 맞는다', () => {
    const undo = applyOverride(r.override);
    try {
      const near = (x: number, y: number) => expect(Math.abs(x / y - 1)).toBeLessThan(0.06); // 가격 사다리 반올림 범위
      near(fishPrice('bigeye') / fishPrice('galapagosshark'), 1.5);
      near(fishPrice('eolgedom') / fishPrice('wahoo'), 1.4);
      const commonMax = Math.max(...FISH.filter(f => f.spot === 'sthelena' && f.rarity === 'common').map(f => f.price));
      near(fishPrice('galapagosshark') / commonMax, 100 * 1.05 ** STH);
    } finally { undo(); }
  });

  it('덮어쓰기에 등급 배율과 밤 배율이 담기고 파서가 받아들인다', () => {
    const spot = r.override.spots!.sthelena;
    expect(spot.gradeMult).toBeDefined();
    expect(spot.nightMult).toBeDefined();
    expect(() => parseOverride(JSON.parse(JSON.stringify(r.override)))).not.toThrow();
  });

  it('현재 가격의 등급 계수 예가 마지막 해역 비율을 재현한다', () => {
    const rare = plain.example.find(x => x.grade === 'rare')!;
    const commonMax = Math.max(...FISH.filter(f => f.spot === 'sthelena' && f.rarity === 'common').map(f => f.price));
    const top = (rarity: string, night: boolean) => Math.max(...FISH.filter(f => f.spot === 'sthelena' && f.rarity === rarity && !!f.night === night).map(f => f.price));
    expect(rare.base * rare.step ** LAST).toBeCloseTo(top('rare', false) / commonMax, 9);
    expect(plain.example.find(x => x.grade === 'epic')!.night).toBeCloseTo(top('epic', true) / top('epic', false), 9);
    expect(plain.example.find(x => x.grade === 'legendary')!.night).toBeCloseTo(top('legendary', true) / top('legendary', false), 9);
  });
});

describe('design 기준점 풀이(회수 시간 방식)', () => {
  const anchor = [{ spot: 'sthelena' as const, ev: 942379 }];
  const pb = { base: 0.5, growth: 0, by: {} };

  it('gap: 기준점 진입 레벨에 가장 가까운 레벨로 구간 합을 정하고 앞 해역에 균등 분배한다', () => {
    const r = designReport(base({ gap: empty, hours: null, payback: pb, anchors: anchor, solve: 'gap' }));
    const gaps = r.resolved.gaps.slice(0, STH) as number[];
    expect(gaps.reduce((s, g) => s + g, 0)).toBe(r.rows[STH].level - 1);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
    const firstBig = gaps.findIndex(g => g === Math.max(...gaps));
    expect(gaps.slice(firstBig).every(g => g === Math.max(...gaps))).toBe(true);
    expect(Math.abs(r.anchors[0].error)).toBeLessThan(0.15);
  }, 60_000);

  it('growth: 증가율을 풀어 기준점 오차가 거의 없다', () => {
    const r = designReport(base({ growth: null, gap: { all: 6, by: {} }, hours: null, payback: pb, anchors: anchor, solve: 'growth' }));
    expect(Math.abs(r.anchors[0].error)).toBeLessThan(1e-3);
    expect(r.resolved.growth).toBeGreaterThan(0.1);
  }, 60_000);

  it('payback: 회수 시간을 풀어 기준점 오차가 거의 없다', () => {
    const r = designReport(base({ gap: { all: 6, by: {} }, hours: null, payback: { base: null, growth: 0, by: {} }, anchors: anchor, solve: 'payback' }));
    expect(Math.abs(r.anchors[0].error)).toBeLessThan(1e-9);
  }, 60_000);

  it('회수 시간 방식은 진입 EV가 진입 레벨 강화비 ÷ h이고 전환 시간은 h의 합이다', () => {
    const r = designReport(base({ hours: null, payback: { base: 0.5, growth: 0.02, by: {} } }));
    const x = r.rows[3];
    const h = (lv: number) => 0.5 * 1.02 ** (lv - 1);
    const undo = applyOverride({ rod: { costBase: 25, costGrowth: 1.15, costPowerFrom: 1_000_000 } });
    try { expect(x.requiredEv).toBeCloseTo(upgradeCost(x.level) / h(x.level), 6); } finally { undo(); }
    expect(x.hours).toBeCloseTo([0, 1, 2, 3, 4].reduce((s, k) => s + h(x.level + k), 0) + x.boatPrice! / x.requiredEv, 9);
  }, 60_000);

  it('회수 시간 방식 H에는 배 가격 ÷ 진입 EV가 들어간다', () => {
    const r = designReport(base({ hours: null, payback: { base: 0.5, growth: 0, by: {} }, boatShare: 0.2 }));
    const withBoat = r.rows.filter((_, i) => i < LAST && SPOTS[i + 1].boatTier > SPOTS[i].boatTier);
    expect(withBoat.length).toBeGreaterThan(0);
    for (const x of withBoat) {
      expect(x.boatPrice! / (x.boatPrice! + x.upgradeSum!)).toBeCloseTo(0.2, 9);
      expect(x.hours).toBeCloseTo(5 * 0.5 + x.boatPrice! / x.requiredEv, 9);
      expect(x.hours!).toBeGreaterThan(5 * 0.5);
    }
  }, 60_000);

  it('기준점 해역을 두 번 주면 거부한다', () => {
    expect(() => designReport(base({ gap: empty, hours: null, payback: pb, anchors: [...anchor, ...anchor], solve: 'gap' }))).toThrow(/두 번/);
  });

  it('gap 풀이는 멀리 떨어진 기준점 사이 해역마다 간격 1 이상을 남긴다', () => {
    // 두 번째 기준점의 EV가 첫 기준점 레벨 바로 위 레벨을 가리켜도, 사이 해역 수만큼은 올라가야 한다
    const undo = applyOverride({ rod: { costBase: 25, costGrowth: 1.15, costPowerFrom: 1_000_000 } });
    const evAt = (lv: number) => upgradeCost(lv) / 0.5;
    const anchors = [{ spot: 'sea' as const, ev: evAt(8) }, { spot: 'sthelena' as const, ev: evAt(5) }];
    undo();
    const r = designReport(base({ gap: empty, hours: null, payback: pb, anchors, solve: 'gap' }));
    const gaps = r.resolved.gaps.slice(0, STH) as number[];
    expect(gaps.every(g => g >= 1)).toBe(true);
    expect(r.rows[2].level).toBeGreaterThanOrEqual(8);
    expect(r.rows[STH].level).toBeGreaterThanOrEqual(r.rows[2].level + (STH - 2));
  }, 60_000);

  it('해역별 회수 시간은 그 해역의 구간을 덮어쓰고 나머지는 곡선을 따른다', () => {
    const plain = designReport(base({ hours: null, payback: pb }));
    const r = designReport(base({ hours: null, payback: { ...pb, by: { sea: 2 } } }));
    const sea = r.rows[2], other = r.rows[3];
    expect(sea.payback).toBe(2);
    expect(sea.hours).toBeCloseTo(5 * 2, 9);
    expect(sea.requiredEv).toBeCloseTo(plain.rows[2].requiredEv / 4, 9);
    expect(other.requiredEv).toBeCloseTo(plain.rows[3].requiredEv, 9);
    expect(other.payback).toBe(0.5);
  }, 60_000);

  it('풀이할 때 기준점 해역의 회수 시간은 지정할 수 없다', () => {
    const solved = base({ gap: { all: 6, by: {} }, hours: null, payback: { base: null, growth: 0, by: { sthelena: 1 } }, anchors: anchor, solve: 'payback' });
    expect(() => designReport(solved)).toThrow(/기준점/);
    expect(() => designReport(base({ hours: null, payback: { ...pb, by: { sea: 0 } } }))).toThrow(/0보다/);
  });

  it('풀 변수의 입력과 함께 주거나 기준점이 없거나 시간 목표 방식이면 거부한다', () => {
    expect(() => designReport(base({ hours: null, payback: pb, anchors: anchor, solve: 'gap' }))).toThrow(/함께/);
    expect(() => designReport(base({ gap: empty, hours: null, payback: pb, anchors: [], solve: 'gap' }))).toThrow(/기준점/);
    expect(() => designReport(base({ gap: empty, solve: 'gap', anchors: anchor }))).toThrow(/회수 시간 방식/);
  });
});

describe('design 시간 목표 방식의 마지막 해역', () => {
  it('기준점이 있으면 마지막 해역의 필요 EV는 기준점 EV이고 기준점 오차 표에는 넣지 않는다', () => {
    const r = designReport(base({ boatShare: 0.2, anchors: [{ spot: 'sthelena', ev: 942379 }] }));
    expect(r.rows[LAST].requiredEv).toBe(942379);
    expect(r.anchors).toEqual([]);
  }, 60_000);

  it('구간이 없는 마지막 해역의 간격과 시간은 받지 않는다', () => {
    expect(() => designReport(base({ hours: { all: 3, by: { sthelena: 2 } } }))).toThrow(/마지막 해역/);
    expect(() => designReport(base({ gap: { all: 5, by: { sthelena: 2 } } }))).toThrow(/마지막 해역/);
  });
});

describe('design 덮어쓰기 내보내기와 전환 시간', () => {
  let dir: string;
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'design-')); return () => rmSync(dir, { recursive: true, force: true }); });

  it('--emit-override 파일을 transition에 넣으면 골드 전환 시간이 목표 H와 맞는다', () => {
    const file = join(dir, 'ov.json');
    const out = runCli(['design', '--start', '25', '--growth', '0.15', '--gap', '5', '--hours', '3', '--emit-override', file]);
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain('덮어쓰기를');
    const ov = parseOverride(JSON.parse(readFileSync(file, 'utf-8')));
    const undo = applyOverride(ov);
    try {
      const t = transitionReport({ axis: 'idle', maxDays: 365 });
      expect(t.complete).toBe(true);
      // 진입 레벨이 낮은 해역은 어종 가격(정수)이 너무 작아 반올림이 크므로, 가격이 충분한 뒤 해역에서 맞춘다.
      // 시뮬레이션은 강화를 살 수 있을 때마다 사서 EV가 오르므로 진입 EV로 계산한 H보다 조금 짧다
      t.timings.slice(7, 12).forEach(x => {
        expect(x.hours).toBeGreaterThan(3 * 0.7);
        expect(x.hours).toBeLessThan(3 * 1.05);
        expect(x.waitFame).toBe(0);
      });
    } finally { undo(); }
  }, 60_000);

  it('같은 덮어쓰기를 dist에 넣어도 돈다', () => {
    const file = join(dir, 'ov2.json');
    expect(runCli(['design', '--start', '25', '--growth', '0.15', '--gap', '4', '--hours', '2', '--emit-override', file]).exitCode).toBe(0);
    const out = runCli(['dist', '--override', file, '--trials', '4']);
    expect(out.stderr).toBe('');
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain('분포 — 해역 전환');
    expect(out.stdout).toContain('"costGrowth":1.15');
  }, 60_000);
});

describe('design 입질 대기 감소 방식', () => {
  it('alternate는 해역 EV와 역전 검사에 반영되고 덮어쓰기에 쓰이며 계산 뒤 복원된다', () => {
    const both = designReport(base());
    const alt = designReport(base({ bite: 'alternate' }));
    expect(alt.override.rod!.biteDecayMode).toBe('alternate');
    expect(both.override.rod!.biteDecayMode).toBeUndefined();
    // 진입 레벨 1은 두 방식이 같고, 레벨이 오를수록 alternate의 입질 대기가 길어 EV가 낮다(필요 EV가 같으므로 가격 배율이 커진다)
    expect(alt.rows[0].currentEv).toBeCloseTo(both.rows[0].currentEv, 6);
    expect(alt.rows[8].currentEv).toBeLessThan(both.rows[8].currentEv);
    expect(alt.rows[8].priceMult).toBeGreaterThan(both.rows[8].priceMult);
    // 입질 대기가 레벨당 덜 줄어 구간 안의 EV 상승이 작다
    expect(alt.reversals[5].ev / alt.rows[5].achievedEv).toBeLessThan(both.reversals[5].ev / both.rows[5].achievedEv);
    expect(biteRangeOf(7).biteMax).toBe(rodStats(7).biteMax);
  }, 60_000);

  it('명령줄 --bite alternate|both는 design에서만 받고 숫자 %는 받지 않는다', () => {
    const args = ['design', '--start', '25', '--growth', '0.15', '--gap', '5', '--hours', '3'];
    const out = runCli([...args, '--bite', 'alternate', '--json']);
    expect(out.stderr).toBe('');
    expect((JSON.parse(out.stdout) as { design: DesignReport }).design.override.rod!.biteDecayMode).toBe('alternate');
    expect(runCli([...args, '--bite', '5']).stderr).toMatch(/--bite/);
    expect(runCli(['transition', '--bite', 'alternate']).stderr).toMatch(/design/);
  }, 60_000);
});

describe('design 출력 문구', () => {
  const args = ['design', '--start', '25', '--growth', '0.15', '--gap', '5', '--hours', '3'];

  it('입질 대기 감소 방식이 입력 절과 가정 문구에 나온다', () => {
    const alt = runCli([...args, '--bite', 'alternate']).stdout;
    expect(alt).toContain('입질 대기 감소 방식 alternate');
    expect(alt).toContain('--bite alternate의 방식');
    expect(alt).not.toContain('입질 속도와 방치 배수의 레벨 효과는 제품 규칙 그대로다');
    const both = runCli(args).stdout;
    expect(both).toContain('입질 대기 감소 방식 both(제품 규칙)');
    expect(both).toContain('입질 속도와 방치 배수의 레벨 효과는 제품 규칙 그대로다');
  }, 60_000);

  it('목표값으로 주어진 마지막 해역은 앞 해역 대비 열에 목표값 기준이라고 적는다', () => {
    const rows = runCli(args).stdout.split('\n').filter(l => l.startsWith('| 세인트헬레나 | 61'));
    expect(rows[0]).toContain('(목표값 기준)');
    const pbRows = runCli(['design', '--start', '25', '--growth', '0.15', '--gap', '5', '--payback', '0.5']).stdout.split('\n').filter(l => l.startsWith('| 세인트헬레나 | 61'));
    expect(pbRows[0]).not.toContain('(목표값 기준)');
  }, 60_000);

  it('전체 기본 회수 시간을 생략하면 기준점에서 풀고 해역별 값은 덮어쓴다', () => {
    const gaps = ['pond=2', 'river=4', 'sea=4', 'deep=5', 'dragonhole=4', 'coron=4', 'barrierreef=5', 'indian=4', 'southindian=5', 'mozstrait=4', 'comorodeep=5', 'benguela=4']
      .flatMap(g => ['--gap', g]);
    const out = runCli(['design', '--start', '100', '--growth', '0.25', '--bite', 'alternate', ...gaps, '--payback-growth', '0.06', '--payback', 'sea=1', '--json']);
    expect(out.stderr).toBe('');
    const d = (JSON.parse(out.stdout) as { design: DesignReport }).design;
    expect(d.rows.find(x => x.spot === 'benguela')!.level).toBe(47);
    expect(d.rows[STH].level).toBe(51);
    expect(d.rows[2].payback).toBe(1);
    expect(d.resolved.solved).toBe('payback');
    expect(Math.abs(d.anchors[0].error)).toBeLessThan(1e-9);
  }, 60_000);
});

describe('design 명령줄', () => {
  it('--hours와 --payback은 함께 줄 수 없고 --start가 필요하다', () => {
    expect(runCli(['design', '--start', '25', '--growth', '0.15', '--gap', '5', '--hours', '3', '--payback', '0.5']).stderr).toMatch(/함께/);
    expect(runCli(['design', '--growth', '0.15', '--gap', '5', '--hours', '3']).stderr).toMatch(/--start/);
    expect(runCli(['design', '--start', '25', '--growth', '0.15', '--gap', '5']).stderr).toMatch(/--hours 또는 --payback/);
  });

  it('해역별 간격과 목표 시간을 여러 번 줄 수 있다', () => {
    const out = runCli(['design', '--start', '25', '--growth', '0.15', '--gap', '5', '--gap', 'sea=4', '--hours', '3', '--hours', 'deep=2', '--anchor', 'none', '--json']);
    expect(out.stderr).toBe('');
    const d = (JSON.parse(out.stdout) as { design: DesignReport }).design;
    expect(d.rows.find(x => x.spot === 'sea')!.gap).toBe(4);
    expect(d.rows.find(x => x.spot === 'deep')!.hours).toBe(2);
    expect(d.anchors).toEqual([]);
  }, 60_000);

  it('기준점을 생략하면 세인트헬레나의 현재 진입 EV를 쓰고 다른 명령에서는 design 옵션을 받지 않는다', () => {
    const out = runCli(['design', '--start', '25', '--growth', '0.15', '--gap', '5', '--payback', '0.5', '--json']);
    const d = (JSON.parse(out.stdout) as { design: DesignReport }).design;
    expect(d.anchors.map(a => a.spot)).toEqual(['sthelena']);
    const hoursRun = JSON.parse(runCli(['design', '--start', '25', '--growth', '0.15', '--gap', '5', '--hours', '3', '--json']).stdout) as { design: DesignReport };
    expect(hoursRun.design.rows.at(-1)!.requiredEv).toBeCloseTo(d.anchors[0].anchorEv, 6);
    expect(d.anchors[0].anchorEv).toBeCloseTo(rates('sthelena', entryLevel('sthelena'), 'idle').goldPerHour, 6);
    expect(runCli(['transition', '--start', '25']).stderr).toMatch(/design/);
    expect(runCli(['ev', '--growth']).exitCode).toBe(0);
    expect(runCli(['ev', '--growth', '0.15']).stderr).toMatch(/ev/);
    expect(runCli(['design', '--start', '25', '--growth', '--gap', '5', '--hours', '3']).stderr).toMatch(/--growth/);
  }, 60_000);
});
