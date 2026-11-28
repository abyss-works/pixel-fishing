import { describe, expect, it } from 'vitest';
import { ARTIFACTS, ARTIFACT_MAX_LEVEL, artifactHasLevel } from '../../../src/game/content/artifacts';
import { MUTATION_WEIGHTS, VARIANT_PRICE_MULT } from '../../../src/game/rules/balance';
import { variantShare } from '../../../src/game/rules/logic';
import { entryLevel, meanCycleSec } from '../model';
import {
  NO_EFFECT,
  artifactSummaryOf,
  earlyRows,
  effectForSpot,
  effectRates,
  incomeRows,
  parseArtifacts,
  resolveZoneSpots,
  supplyRows,
} from './effects';
import type { Effect, TripTime } from './effects';
import { parseArgs, renderText, runCli, runFlow } from './report';
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';

const fx = (e: Partial<Effect>): Effect => ({ ...NO_EFFECT, ...e });

describe('--zone 구역·해역 한정 효과 및 단면 출력', () => {
  it('최상위 구역 id와 개별 해역 id를 해석하고 알 수 없는 id는 거부한다', () => {
    expect(resolveZoneSpots('pacific')).toEqual(['sea', 'deep']);
    expect(resolveZoneSpots('village')).toEqual(['pond', 'river']);
    expect(resolveZoneSpots('sthelena')).toEqual(['sthelena']);
    expect(resolveZoneSpots('indian').length).toBeGreaterThan(1);
    expect(resolveZoneSpots('spot:indian')).toEqual(['indian']);
    expect(() => resolveZoneSpots('spot:mars')).toThrow(/해역/);
    expect(() => resolveZoneSpots('mars')).toThrow(/구역|해역/);
  });

  it('effects 명령에서만 --zone을 허용하고 구역 한정 효과는 대상 밖 해역에 걸리지 않는다', () => {
    const o = parseArgs(['effects', '--zone', 'pacific', '--bite', '10']);
    expect(o.zone).toBe('pacific');
    expect(o.effect.bite).toBeCloseTo(0.1, 12);
    expect(() => parseArgs(['transition', '--zone', 'pacific'])).toThrow(/effects 명령에서만/);
    expect(() => parseArgs(['effects', '--zone', 'unknown'])).toThrow(/구역|해역/);

    const e = fx({ bite: 0.1, rare: 0.2 });
    expect(effectForSpot('sea', e, 'pacific').bite).toBeCloseTo(0.1, 12);
    expect(effectForSpot('deep', e, 'pacific').rare).toBeCloseTo(0.2, 12);
    expect(effectForSpot('pond', e, 'pacific')).toEqual(NO_EFFECT);
    expect(effectForSpot('sthelena', e, 'pacific')).toEqual(NO_EFFECT);
  });

  it('incomeRows, supplyRows는 지정 구역의 해역 단면만 출력한다', () => {
    const inc = incomeRows({ axis: 'idle', effect: fx({ bite: 0.1 }), margin: 0, zone: 'pacific' });
    expect(inc.map(r => r.spot)).toEqual(['sea', 'deep']);
    expect(inc.every(r => r.goldChange > 0)).toBe(true);

    const sup = supplyRows({ axis: 'idle', effect: fx({ rare: 0.2 }), margin: 0, units: { common: 1, rare: 5, epic: 25, legendary: 125 }, zone: 'sthelena' });
    expect(sup.map(r => r.spot)).toEqual(['sthelena']);
  });

  it('조기 진입 비교에서 대상 해역만 구역 한정 효과를 받고 구역 밖 비교 해역은 받지 않는다', () => {
    const rows = earlyRows({ axis: 'idle', effect: fx({ bite: 0.2 }), margin: -2, zone: 'coron' });
    expect(rows.map(r => r.spot)).toEqual(['coron']);
    expect(rows[0].ratioWith).toBeGreaterThan(rows[0].ratioBase);
  });

  it('CLI 텍스트와 JSON에 구역 한정 단면이 반영되고 미지정 시 기존 출력과 같다', () => {
    const withZone = runFlow(parseArgs(['effects', '--zone', 'pacific', '--rare', '20', '--trials', '2', '--seed', '3']));
    expect(withZone.effects!.zone).toBe('pacific');
    expect(withZone.effects!.zoneSpots).toEqual(['sea', 'deep']);
    expect(withZone.effects!.income.map(r => r.spot)).toEqual(['sea', 'deep']);
    expect(withZone.effects!.dex.map(r => r.spot)).toEqual(['sea', 'deep']);
    const text = renderText(withZone);
    expect(text).toContain('구역 한정');
    expect(text).toContain('태평양 연안');
    expect(text).not.toContain('마을 연못');

    const plain = runFlow(parseArgs(['effects', '--trials', '2', '--seed', '3']));
    expect(plain.effects!.zone).toBeUndefined();
    expect(plain.effects!.income).toHaveLength(SPOTS.length);
  });
});

describe('--artifacts 및 --artifact-boost 유물 보너스 합산(1±합 1회 적용)', () => {
  it('유물 목록 문자열과 레벨을 파싱하고 잘못된 입력을 거부한다', () => {
    const all1 = parseArtifacts('all');
    expect(Object.keys(all1)).toHaveLength(ARTIFACTS.length);
    for (const a of ARTIFACTS) {
      expect(all1[a.id]).toBe(artifactHasLevel(a) ? 1 : ARTIFACT_MAX_LEVEL);
    }

    const max = parseArtifacts('max');
    expect(max['outer-isle-sinker']).toBe(ARTIFACT_MAX_LEVEL);
    expect(max['mami-wata-mirror']).toBe(ARTIFACT_MAX_LEVEL);

    const all3 = parseArtifacts('all:3');
    for (const a of ARTIFACTS) {
      expect(all3[a.id]).toBe(artifactHasLevel(a) ? 3 : ARTIFACT_MAX_LEVEL);
    }

    expect(parseArtifacts('mami-wata-mirror')).toEqual({ 'mami-wata-mirror': ARTIFACT_MAX_LEVEL });
    expect(parseArtifacts('mami-wata-mirror:5')).toEqual({ 'mami-wata-mirror': ARTIFACT_MAX_LEVEL });
    expect(parseArtifacts('outer-isle-sinker')).toEqual({ 'outer-isle-sinker': 1 });

    const custom = parseArtifacts('outer-isle-sinker:5,elder-scale:3');
    expect(custom).toEqual({ 'outer-isle-sinker': 5, 'elder-scale': 3 });

    expect(() => parseArtifacts('unknown-relic')).toThrow(/유물/);
    expect(() => parseArtifacts('outer-isle-sinker:6')).toThrow(/레벨/);
    expect(() => parseArtifacts('mami-wata-mirror:1')).toThrow(/Lv5 고정/);
    expect(() => parseArtifacts('mami-wata-mirror:2')).toThrow(/전설/);
  });

  it('CLI 인자에서 --artifacts(값 생략·목록)와 --artifact-boost를 검증한다', () => {
    const bare = parseArgs(['effects', '--artifacts', '--artifact-boost', '20']);
    expect(bare.artifacts).toEqual(parseArtifacts('all'));
    expect(bare.artifactBoost).toBeCloseTo(0.2, 12);

    const list = parseArgs(['effects', '--artifacts', 'outer-isle-sinker:5', '--artifact-boost', '50']);
    expect(list.artifacts).toEqual({ 'outer-isle-sinker': 5 });
    expect(list.artifactBoost).toBeCloseTo(0.5, 12);

    expect(() => parseArgs(['effects', '--artifact-boost', '20'])).toThrow(/--artifacts/);
    expect(() => parseArgs(['effects', '--artifacts', '--artifact-boost', '-5'])).toThrow(/0 이상/);
    expect(() => parseArgs(['transition', '--artifacts'])).toThrow(/effects 명령에서만/);
  });

  it('입질 대기 단축: 유물 효과 × (1 + 배율)과 일반 효과를 더해 (1 - 합)으로 1회만 적용한다', () => {
    const spot: SpotId = 'sthelena';
    const level = entryLevel(spot);
    const artifacts = parseArtifacts('outer-isle-sinker:5'); // biteWaitCut = 0.1 * 2 = 0.2
    const combined = effectForSpot(spot, fx({ bite: 0.1 }), undefined, artifacts, 0.5); // 0.2 * 1.5 + 0.1 = 0.4
    expect(combined.bite).toBeCloseTo(0.4, 12);

    const base = effectRates(spot, level, 'idle', NO_EFFECT);
    const now = effectRates(spot, level, 'idle', combined);
    const expectedBite = ((base.cycle.biteMin + base.cycle.biteMax) / 2 + base.cycle.biteExtra) * (1 - 0.4);
    const actualBite = (now.cycle.biteMin + now.cycle.biteMax) / 2 + now.cycle.biteExtra;
    expect(actualBite).toBeCloseTo(expectedBite, 9);
    expect(meanCycleSec(now.cycle)).toBeLessThan(meanCycleSec(base.cycle));
  });

  it('돌연변이 가중치: 유물 효과 × (1 + 배율)과 일반 효과를 더해 (1 + 합)으로 1회만 적용한다', () => {
    const spot: SpotId = 'sthelena';
    const level = entryLevel(spot);
    const artifacts = parseArtifacts('elder-scale:5'); // variantBoost = 0.25 * 2 = 0.5
    const combined = effectForSpot(spot, fx({ variant: 1.5 }), undefined, artifacts, 0.2); // 0.5 * 1.2 + 1.5 = 2.1
    expect(combined.variant).toBeCloseTo(2.1, 12);

    const now = effectRates(spot, level, 'idle', combined);
    const expectedShare = variantShare({ variant: MUTATION_WEIGHTS.variant * (1 + 2.1), normal: MUTATION_WEIGHTS.normal });
    expect(now.variantShare).toBeCloseTo(expectedShare, 12);
    const base = effectRates(spot, level, 'idle', NO_EFFECT);
    const ev = (s: number) => 1 + s * (VARIANT_PRICE_MULT - 1);
    expect(now.goldPerHour / base.goldPerHour).toBeCloseTo(ev(now.variantShare) / ev(base.variantShare), 9);
  });

  it('항해 속도 유물은 대양 해역에서만 이동 속도에 합산되고 마을 도보에는 적용되지 않는다', () => {
    const artifacts = parseArtifacts('wreck-compass:5'); // sail = 0.1 * 2 = 0.2
    const seaFx = effectForSpot('sea', fx({ move: 0.1 }), undefined, artifacts, 0.5); // 0.2 * 1.5 + 0.1 = 0.4
    const pondFx = effectForSpot('pond', fx({ move: 0.1 }), undefined, artifacts, 0.5); // village walk -> 0.1 only
    expect(seaFx.move).toBeCloseTo(0.4, 12);
    expect(pondFx.move).toBeCloseTo(0.1, 12);

    const trips = new Map<SpotId, TripTime>(SPOTS.map(s => [s.id, { bagCap: 10, tripSec: 140 }]));
    const rows = incomeRows({ axis: 'idle', effect: fx({ move: 0.1 }), margin: 0, trips, artifacts, artifactBoost: 0.5 });
    const seaRow = rows.find(r => r.spot === 'sea')!;
    const pondRow = rows.find(r => r.spot === 'pond')!;
    expect(seaRow.tripChange!).toBeGreaterThan(pondRow.tripChange!);
  });

  it('판매가 효과(--sell)는 골드에만 (1 + 합)으로 적용되고 명성과 캐치 속도는 그대로다', () => {
    const spot: SpotId = 'sthelena';
    const level = entryLevel(spot);
    const base = effectRates(spot, level, 'idle', NO_EFFECT);
    const now = effectRates(spot, level, 'idle', fx({ sell: 0.25 }));
    expect(now.goldPerHour).toBeCloseTo(base.goldPerHour * 1.25, 9);
    expect(now.famePerHour).toBeCloseTo(base.famePerHour, 9);
    expect(now.catchesPerHour).toBeCloseTo(base.catchesPerHour, 9);
  });

  it('effects --artifacts --artifact-boost CLI 출력에 유물 요약과 유물 배율 증가분이 포함된다', () => {
    const summary = artifactSummaryOf(parseArtifacts('all:5'), 0.25);
    expect(summary.bite).toBeCloseTo(0.25, 12);
    expect(summary.variant).toBeCloseTo(0.625, 12);
    expect(summary.sail).toBeCloseTo(0.25, 12);

    const cli = runCli(['effects', '--zone', 'southatlantic', '--artifacts', 'all:5', '--artifact-boost', '25', '--trials', '2', '--seed', '3']);
    expect(cli.exitCode).toBe(0);
    expect(cli.stdout).toContain('유물 효과 요약');
    expect(cli.stdout).toContain('유물 기본 대비');

    const json = JSON.parse(runCli(['effects', '--zone', 'southatlantic', '--artifacts', 'all:5', '--artifact-boost', '25', '--trials', '2', '--seed', '3', '--json']).stdout);
    expect(json.effects.artifactBoost).toBeCloseTo(0.25, 12);
    expect(json.effects.income[0].vsArtifact.goldChange).toBeGreaterThan(0);
  });
});
