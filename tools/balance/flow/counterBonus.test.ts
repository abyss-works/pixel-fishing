import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ARTIFACT_MAX_LEVEL } from '../../../src/game/content/artifacts';
import { FISH } from '../../../src/game/content/fish';
import { SPOTS } from '../../../src/game/content/spots';
import { rng } from '../model';
import { createCounterBonusTracker, loadCounterBonus, parseCounterBonus } from './counterBonus';
import type { CounterBonusConfig } from './counterBonus';
import { effectPlan } from './cooking';
import { daysReport } from './days';
import { bigMarksDist, transitionDist } from './dist';
import { NO_EFFECT } from './effects';
import { gatesReport } from './gateReport';
import { simulate } from './progress';
import { parseArgs, runCli } from './report';
import { createSampler } from './sample';
import { transitionReport } from './transitions';

const tempDir = mkdtempSync(join(tmpdir(), 'pf-counter-bonus-'));
afterAll(() => { rmSync(tempDir, { recursive: true, force: true }); });

const writeJson = (name: string, data: unknown): string => {
  const path = join(tempDir, name);
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  return path;
};

const sampleLegendary = FISH.find(f => f.rarity === 'legendary')!.id;

describe('카운터 보너스 JSON 스키마 검증', () => {
  it('지원하는 모든 카운터 키와 단계별 효과를 정상 파싱한다', () => {
    const raw = {
      artifacts: 'outer-isle-sinker:5,elder-scale:5',
      rules: [
        { counter: 'manual.total', thresholds: [10, 100], effects: [{ bite: 0.02 }, { bite: 0.03 }] },
        { counter: 'manual.legendary.total', thresholds: [1, 5], effects: [{ rare: 0.05 }, { legendary: 0.1 }] },
        { counter: 'manual.variant.total', thresholds: [1], effects: [{ variant: 0.1 }] },
        { counter: 'catch.auto', thresholds: [500, 2000], effects: [{ bite: 0.05 }, { bite: 0.05 }] },
        { counter: 'catch.perfect', thresholds: [100], effects: [{ epic: 0.1 }] },
        { counter: 'catch.bait', thresholds: [10], effects: [{ named: 0.1 }] },
        { counter: 'named.flawless', thresholds: [1, 5], effects: [{ move: 0.05 }, { artifactBoost: 0.1 }] },
        { counter: 'sell.gold', thresholds: [10000, 100000], effects: [{ sell: 0.05 }, { sell: 0.05 }] },
        { counter: 'bigSpecies', thresholds: [10, 30], effects: [{ big: 0.1 }, { big: 0.15 }] },
        { counter: 'maxArtifact', thresholds: [1], effects: [{ artifactBoost: 0.2 }] },
        { counter: 'manual.variant.pacific', thresholds: [1], effects: [{ variant: 0.1, zone: 'pacific' }] },
        { counter: 'manual.legendary.pacific', thresholds: [1], effects: [{ rare: 0.1, zone: 'pacific' }] },
        { counter: `manual.legendary.${sampleLegendary}`, thresholds: [1], effects: [{ sell: 0.05 }] },
        { counter: 'manual.total.village', thresholds: [50], effects: [{ bite: 0.05, zone: 'village' }] },
      ],
    };
    const cfg = parseCounterBonus(raw);
    expect(cfg.rules).toHaveLength(raw.rules.length);
    expect(cfg.artifacts).toEqual({ 'outer-isle-sinker': 5, 'elder-scale': 5 });
  });

  it('잘못된 카운터 키, 임계점 순서, 효과 길이·범위를 거부한다', () => {
    expect(() => parseCounterBonus({ rules: [] })).toThrow(/rules/);
    expect(() => parseCounterBonus({ rules: [{ counter: 'unknown.key', thresholds: [10], effects: [{ bite: 0.05 }] }] })).toThrow(/카운터/);
    expect(() => parseCounterBonus({ rules: [{ counter: 'manual.variant.mars', thresholds: [1], effects: [{ variant: 0.1 }] }] })).toThrow(/카운터/);
    expect(() => parseCounterBonus({ rules: [{ counter: 'catch.auto', thresholds: [100, 100], effects: [{ bite: 0.05 }, { bite: 0.05 }] }] })).toThrow(/오름차순/);
    expect(() => parseCounterBonus({ rules: [{ counter: 'catch.auto', thresholds: [0], effects: [{ bite: 0.05 }] }] })).toThrow(/0보다/);
    expect(() => parseCounterBonus({ rules: [{ counter: 'catch.auto', thresholds: [10, 20], effects: [{ bite: 0.05 }] }] })).toThrow(/길이/);
    expect(() => parseCounterBonus({ rules: [{ counter: 'catch.auto', thresholds: [10], effects: [{ bite: 1 }] }] })).toThrow(/입질/);
    expect(() => parseCounterBonus({ rules: [{ counter: 'catch.auto', thresholds: [10], effects: [{ sell: -1 }] }] })).toThrow(/판매가/);
    expect(() => parseCounterBonus({ rules: [{ counter: 'catch.auto', thresholds: [10], effects: [{ unknownField: 0.1 }] }] })).toThrow(/알 수 없는 효과/);
    expect(() => parseCounterBonus({ rules: [{ counter: 'catch.auto', thresholds: [10], effects: [{ bite: 0.1, zone: 'mars' }] }] })).toThrow(/구역|해역/);
    expect(() => parseCounterBonus({ rules: [{ counter: 'catch.auto', thresholds: [10, 20], effects: [{ bite: 0.6 }, { bite: 0.5 }] }] })).toThrow(/입질/);
  });

  it('JSON 파일에서 로드한다', () => {
    const file = writeJson('valid.json', {
      rules: [{ counter: 'catch.auto', thresholds: [500], effects: [{ bite: 0.1 }] }],
    });
    const cfg = loadCounterBonus(file);
    expect(cfg.rules[0].counter).toBe('catch.auto');
  });

  it('전설 유물은 문자열과 객체 모두 최고 레벨(Lv5) 고정으로 검증·반영한다', () => {
    const rule = [{ counter: 'maxArtifact', thresholds: [1], effects: [{ bite: 0.05 }] }];
    const fromStr = parseCounterBonus({ artifacts: 'mami-wata-mirror', rules: rule });
    expect(fromStr.artifacts).toEqual({ 'mami-wata-mirror': ARTIFACT_MAX_LEVEL });

    const fromObj = parseCounterBonus({ artifacts: { 'mami-wata-mirror': ARTIFACT_MAX_LEVEL }, rules: rule });
    expect(fromObj.artifacts).toEqual({ 'mami-wata-mirror': ARTIFACT_MAX_LEVEL });

    expect(() => parseCounterBonus({ artifacts: 'mami-wata-mirror:1', rules: rule })).toThrow(/Lv5 고정/);
    expect(() => parseCounterBonus({ artifacts: { 'mami-wata-mirror': 1 }, rules: rule })).toThrow(/Lv5 고정/);
    expect(() => parseCounterBonus({ artifacts: { 'mami-wata-mirror': 3 }, rules: rule })).toThrow(/Lv5 고정/);

    const tracker = createCounterBonusTracker(fromObj);
    expect(tracker.evaluate(0, 'sea')).toBe(true);
    expect(tracker.unlocks).toHaveLength(1);
  });
});

describe('시뮬레이션 동적 카운터 누적 및 보너스 반영', () => {
  it('catch.auto와 sell.gold 임계점 통과에 따라 보너스가 누적 합산되어 진행이 빨라진다', () => {
    const cfg: CounterBonusConfig = parseCounterBonus({
      rules: [
        { counter: 'catch.auto', thresholds: [500, 3000], effects: [{ bite: 0.1 }, { bite: 0.1 }] },
        { counter: 'sell.gold', thresholds: [10000, 500000], effects: [{ sell: 0.1 }, { sell: 0.15 }] },
      ],
    });
    const base = simulate({ axis: 'idle', bounty: false, maxDays: 365 });
    const boosted = simulate({ axis: 'idle', bounty: false, maxDays: 365, counterBonus: cfg });

    expect(boosted.counterUnlocks).toBeDefined();
    expect(boosted.counterUnlocks!.length).toBe(4);
    // 해금 시각은 단조 증가하고 마지막 해역 도착이 빨라진다
    for (let i = 1; i < boosted.counterUnlocks!.length; i++) {
      expect(boosted.counterUnlocks![i].hours).toBeGreaterThanOrEqual(boosted.counterUnlocks![i - 1].hours);
    }
    expect(boosted.arrivals.at(-1)!.hours).toBeLessThan(base.arrivals.at(-1)!.hours);
  });

  it('방치 축에서는 manual.* 카운터가 쌓이지 않고 수동 축에서만 누적된다', () => {
    const cfg = parseCounterBonus({
      rules: [{ counter: 'manual.total', thresholds: [50], effects: [{ sell: 0.2 }] }],
    });
    const idleBase = simulate({ axis: 'idle', bounty: false, maxDays: 365 });
    const idleWith = simulate({ axis: 'idle', bounty: false, maxDays: 365, counterBonus: cfg });
    expect(idleWith.counterUnlocks).toEqual([]);
    expect(idleWith.arrivals).toEqual(idleBase.arrivals);

    const manualBase = simulate({ axis: 'manual', bounty: false, maxDays: 365 });
    const manualWith = simulate({ axis: 'manual', bounty: false, maxDays: 365, counterBonus: cfg });
    expect(manualWith.counterUnlocks!.length).toBe(1);
    expect(manualWith.arrivals.at(-1)!.hours).toBeLessThan(manualBase.arrivals.at(-1)!.hours);
  });

  it('bigSpecies와 대어(big) 보너스, 표본 경로 판매가 보너스가 동적으로 작동한다', () => {
    const sellCfg = parseCounterBonus({
      rules: [
        { counter: 'bigSpecies', thresholds: [10, 30], effects: [{ sell: 0.1 }, { sell: 0.15 }] },
      ],
    });
    const baseAnalytic = simulate({ axis: 'idle', bounty: false, maxDays: 365 });
    const withAnalytic = simulate({ axis: 'idle', bounty: false, maxDays: 365, counterBonus: sellCfg });
    expect(withAnalytic.counterUnlocks!.length).toBe(2);
    expect(withAnalytic.arrivals.at(-1)!.hours).toBeLessThan(baseAnalytic.arrivals.at(-1)!.hours);

    const baseMc = simulate({ axis: 'idle', bounty: false, maxDays: 365, sampler: createSampler(rng(17)), bigMarks: [50] });
    const withSellMc = simulate({ axis: 'idle', bounty: false, maxDays: 365, sampler: createSampler(rng(17)), bigMarks: [50], counterBonus: sellCfg });
    expect(withSellMc.counterUnlocks!.length).toBe(2);
    expect(withSellMc.arrivals.at(-1)!.hours).toBeLessThan(baseMc.arrivals.at(-1)!.hours);

    // 대어(big) 보너스만 걸면 전환 시점과 난수 소비가 동일해 월척 달성 시각이 항상 빨라지거나 같다
    const bigOnlyCfg = parseCounterBonus({
      rules: [{ counter: 'bigSpecies', thresholds: [5], effects: [{ big: 0.5 }] }],
    });
    const withBigMc = simulate({ axis: 'idle', bounty: false, maxDays: 365, sampler: createSampler(rng(17)), bigMarks: [50], counterBonus: bigOnlyCfg });
    expect(withBigMc.counterUnlocks!.length).toBe(1);
    expect(withBigMc.bigMarkHours[0]!).toBeLessThan(baseMc.bigMarkHours[0]!);
  });

  it('의뢰 수행 시 named.flawless와 maxArtifact, artifactBoost가 유물 효과와 누적 합산된다', () => {
    const cfg = parseCounterBonus({
      artifacts: 'outer-isle-sinker:5',
      rules: [
        { counter: 'maxArtifact', thresholds: [1], effects: [{ bite: 0.05 }] },
        { counter: 'named.flawless', thresholds: [1], effects: [{ artifactBoost: 0.5 }] },
      ],
    });
    const baseBounty = simulate({ axis: 'idle', bounty: true, maxDays: 365, growTo: 65 });
    const withBounty = simulate({ axis: 'idle', bounty: true, maxDays: 365, growTo: 65, counterBonus: cfg });
    expect(withBounty.counterUnlocks!.some(u => u.counter === 'maxArtifact')).toBe(true);
    expect(withBounty.counterUnlocks!.some(u => u.counter === 'named.flawless')).toBe(true);
    expect(withBounty.marks.at(-1)!.hours).toBeLessThan(baseBounty.marks.at(-1)!.hours);
  });

  it('구역 한정 카운터 보너스는 해당 구역 해역에만 적용된다', () => {
    const cfg = parseCounterBonus({
      rules: [{ counter: 'catch.auto', thresholds: [1], effects: [{ sell: 0.5, zone: 'pacific' }] }],
    });
    const base = simulate({ axis: 'idle', bounty: false, maxDays: 365 });
    const withZone = simulate({ axis: 'idle', bounty: false, maxDays: 365, counterBonus: cfg });
    // 마을 연못 -> 마을 강 -> 태평양 연안 도착 전까지는 마을이므로 동일하다
    const seaIdx = SPOTS.findIndex(s => s.id === 'sea');
    expect(withZone.arrivals[seaIdx].hours).toBeCloseTo(base.arrivals[seaIdx].hours, 9);
    // 태평양 연안 이후(마리아나 해구 도착)는 빨라진다
    const deepIdx = SPOTS.findIndex(s => s.id === 'deep');
    expect(withZone.arrivals[deepIdx].hours).toBeLessThan(base.arrivals[deepIdx].hours);
  });
});

describe('--counter-bonus CLI 및 보고서 연동', () => {
  const file = writeJson('cli-bonus.json', {
    rules: [
      { counter: 'catch.auto', thresholds: [500, 3000], effects: [{ bite: 0.1 }, { sell: 0.15 }] },
    ],
  });

  it('transition, days, gates, dist에서만 --counter-bonus를 허용한다', () => {
    for (const cmd of ['transition', 'days', 'gates', 'dist'] as const) {
      expect(parseArgs([cmd, '--counter-bonus', file]).counterBonus).toBe(file);
    }
    expect(() => parseArgs(['effects', '--counter-bonus', file])).toThrow(/명령에서만/);
    expect(() => parseArgs(['ev', '--counter-bonus', file])).toThrow(/명령에서만/);
  });

  it('transition, days, gates, dist가 보너스 없음 기준 대비 차이와 해금 시점을 낸다', () => {
    const cfg = loadCounterBonus(file);
    const tr = transitionReport({ axis: 'idle', maxDays: 365, counterBonus: cfg });
    expect(tr.base).toBeDefined();
    expect(tr.counterUnlocks!.length).toBe(2);
    expect(tr.timings.at(-1)!.cumulativeHours).toBeLessThan(tr.base!.at(-1)!.cumulativeHours);

    const dy = daysReport({ axis: 'idle', maxDays: 365, counterBonus: cfg });
    expect(dy.base).toBeDefined();
    expect(dy.arrival[0].spots.at(-1)!.hours!).toBeLessThan(dy.base!.arrival[0].spots.at(-1)!.hours!);

    const gt = gatesReport({ maxDays: 365, legendAts: [15], counterBonus: cfg });
    expect(gt.counterBonus).toBe(true);
    expect(gt.time.at(-1)!.baseHours).toBeDefined();

    const tdBase = transitionDist({ trials: 4, seed: 7, axis: 'idle', maxDays: 365 });
    const tdBonus = transitionDist({ trials: 4, seed: 7, axis: 'idle', maxDays: 365, counterBonus: cfg });
    expect(tdBonus.at(-1)!.cumulative!.p50).toBeLessThan(tdBase.at(-1)!.cumulative!.p50);

    const bm = bigMarksDist({ trials: 4, seed: 7, axis: 'idle', bounty: false, maxDays: 365, marks: [20, 50], counterBonus: cfg });
    expect(bm.rows[0].hours).not.toBeNull();

    // CLI 텍스트 및 JSON 검증
    const trCli = runCli(['transition', '--counter-bonus', file]);
    expect(trCli.exitCode).toBe(0);
    expect(trCli.stdout).toContain('카운터 보너스');
    expect(trCli.stdout).toContain('보너스 없음');

    const dyCli = runCli(['days', '--counter-bonus', file]);
    expect(dyCli.exitCode).toBe(0);
    expect(dyCli.stdout).toContain('카운터 보너스');

    const gtCli = runCli(['gates', '--counter-bonus', file]);
    expect(gtCli.exitCode).toBe(0);
    expect(gtCli.stdout).toContain('카운터 보너스');

    const distJson = JSON.parse(runCli(['dist', '--counter-bonus', file, '--big-marks', '20,50', '--trials', '3', '--seed', '7', '--json']).stdout);
    expect(distJson.options.counterBonus).toBeDefined();
    expect(distJson.dist.bigMarks.rows).toHaveLength(2);
  });

  it('plan과 카운터 보너스 합산 결과가 유효 범위를 벗어나면 오류로 거부한다', () => {
    const overBitePlan = effectPlan({ effect: { ...NO_EFFECT, bite: 0.6 }, fromBoat: 0 });
    const overBiteBonus = parseCounterBonus({
      rules: [{ counter: 'catch.auto', thresholds: [1], effects: [{ bite: 0.5 }] }],
    });
    expect(() => simulate({ axis: 'idle', bounty: false, maxDays: 5, plan: overBitePlan, counterBonus: overBiteBonus }))
      .toThrow(/입질/);

    const underSellPlan = effectPlan({ effect: { ...NO_EFFECT, sell: -0.6 }, fromBoat: 0 });
    const underSellBonus = parseCounterBonus({
      rules: [{ counter: 'catch.auto', thresholds: [1], effects: [{ sell: -0.5 }] }],
    });
    expect(() => simulate({ axis: 'idle', bounty: false, maxDays: 5, plan: underSellPlan, counterBonus: underSellBonus }))
      .toThrow(/판매가/);
  });

  it('daysReport에서 counterBonus 사용 시 최대 일수 내 미도달이면 bounty 여부와 관계없이 levelUp이 null이다', () => {
    const cfg = loadCounterBonus(file);
    const short = daysReport({ axis: 'idle', maxDays: 1, counterBonus: cfg });
    const noBountyLevelUps = short.levelUp.filter(r => !r.bounty);
    const withBountyLevelUps = short.levelUp.filter(r => r.bounty);
    expect(noBountyLevelUps.length).toBeGreaterThan(0);
    expect(withBountyLevelUps.length).toBeGreaterThan(0);
    for (const row of [...noBountyLevelUps, ...withBountyLevelUps]) {
      expect(row.dailyGold).toBeNull();
      expect(row.bountyShare).toBeNull();
      expect(row.hours).toBeNull();
      expect(row.days).toBeNull();
    }
  });
});
