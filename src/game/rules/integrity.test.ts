// 서버 추첨 가중치 조정 계통의 순수 규칙 검증 — 설정 값은 테스트가 명시 주입한다.
import { describe, expect, it } from 'vitest';
import {
  calculateIntegrityModifier,
  emptyIntegrityState,
  parseIntegrityConfig,
  processIntegrityInput,
} from './integrity';
import type { IntegrityConfig, IntegrityState } from './integrity';

const CONFIG: IntegrityConfig = {
  spanMax: 0.0063,
  runLength: 10,
  sessionGapMs: 19_800,
  pressureStep: 27,
  pressureLeak: 1.8,
  midPressure: 19,
  highPressure: 47,
  midModifier: 0.7,
  highModifier: 0.4,
};

const sample = (pos: number, at: number) => ({ kind: 'sample' as const, pos, at });
const breakInput = (at: number) => ({ kind: 'break' as const, at });

function feedPositions(
  positions: readonly number[],
  startAt = 1_000,
  gapMs = 3_000,
  initial: IntegrityState = emptyIntegrityState(),
) {
  let state = initial;
  const out = [];
  for (const [i, pos] of positions.entries()) {
    const r = processIntegrityInput(state, sample(pos, startAt + i * gapMs), CONFIG);
    out.push(r);
    state = r.state;
  }
  return { state, results: out };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise(kind: 'normal' | 'uniform' | 'laplace', rng: () => number, sigma: number): number {
  if (kind === 'uniform') return (rng() * 2 - 1) * Math.sqrt(3) * sigma;
  if (kind === 'laplace') {
    const u = rng() - 0.5;
    return -Math.sign(u) * Math.log(1 - 2 * Math.abs(u)) * sigma / Math.SQRT2;
  }
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
}

function simulatePositions(
  seed: number,
  kind: 'normal' | 'uniform' | 'laplace',
  sigmaMs: number,
  count: number,
  centerMs = 700,
): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => (centerMs + noise(kind, rng, sigmaMs)) / 1400);
}

function triggersIn(positions: readonly number[], gapMs = 3_000): number {
  return feedPositions(positions, 1_000, gapMs).results.filter(r => r.triggered).length;
}

describe('최종 배수 계산과 설정 주입', () => {
  it('압력 구간 경계에서만 배수가 바뀌고 미설정·잘못된 설정은 비활성이다', () => {
    expect(calculateIntegrityModifier(0, CONFIG)).toBe(1);
    expect(calculateIntegrityModifier(CONFIG.midPressure - 0.001, CONFIG)).toBe(1);
    expect(calculateIntegrityModifier(CONFIG.midPressure, CONFIG)).toBe(CONFIG.midModifier);
    expect(calculateIntegrityModifier(CONFIG.highPressure - 0.001, CONFIG)).toBe(CONFIG.midModifier);
    expect(calculateIntegrityModifier(CONFIG.highPressure, CONFIG)).toBe(CONFIG.highModifier);

    expect(parseIntegrityConfig(undefined)).toBeNull();
    expect(parseIntegrityConfig('')).toBeNull();
    expect(parseIntegrityConfig('not-json')).toBeNull();
    expect(parseIntegrityConfig(JSON.stringify({ ...CONFIG, runLength: 1 }))).toBeNull();
    expect(parseIntegrityConfig(JSON.stringify({ ...CONFIG, midPressure: CONFIG.highPressure }))).toBeNull();
    expect(parseIntegrityConfig(JSON.stringify({ ...CONFIG, midModifier: 1.2 }))).toBeNull();
    expect(parseIntegrityConfig(JSON.stringify(CONFIG))).toEqual(CONFIG);
  });
});

describe('연속 입력 창 판정', () => {
  it('좁은 총폭이 기준 횟수에 닿으면 창 판정과 입력 원본을 돌려준다', () => {
    const positions = Array.from({ length: CONFIG.runLength }, (_, i) => 0.5 + (i % 2) * CONFIG.spanMax / 2);
    const { results } = feedPositions(positions);
    expect(results.slice(0, -1).some(r => r.triggered)).toBe(false);
    const hit = results.at(-1)!;
    expect(hit.triggered).toBe(true);
    expect(hit.signal).toMatchObject({
      detector: 'window-a',
      runLength: CONFIG.runLength,
    });
    expect(hit.signal?.span).toBeCloseTo(CONFIG.spanMax / 2, 12);
    expect(hit.signal?.positions).toHaveLength(CONFIG.runLength);
  });

  it('총폭이 정확히 0이면 창 판정을 하지 않는다', () => {
    const { results } = feedPositions(Array.from({ length: CONFIG.runLength + 5 }, () => 0.5));
    expect(results.some(r => r.triggered)).toBe(false);
  });

  it('총폭이 기준을 넘으면 길이와 무관하게 판정하지 않는다', () => {
    const positions = Array.from({ length: 30 }, (_, i) => 0.5 + (i % 2) * (CONFIG.spanMax + 0.001));
    expect(triggersIn(positions)).toBe(0);
  });

  it('기준보다 짧은 연속은 판정하지 않는다', () => {
    const narrow = Array.from({ length: 6 }, (_, i) => 0.5 + (i % 2) * 0.001);
    const wide = [0.2, 0.8, 0.25, 0.75];
    expect(triggersIn([...narrow, ...wide])).toBe(0);
  });

  it('입력 간격 상한을 넘기면 연속 창을 새로 시작한다', () => {
    const first = feedPositions(Array.from({ length: 9 }, () => 0.5 + 0.001), 1_000, 1_000);
    const second = feedPositions(Array.from({ length: 9 }, () => 0.5 + 0.002), 1_000 + 9 * 1_000 + CONFIG.sessionGapMs + 1, 1_000, first.state);
    expect(second.results.some(r => r.triggered)).toBe(false);
  });

  it('break 입력이 끼면 연속 창이 끊긴다', () => {
    let state = feedPositions(Array.from({ length: 9 }, () => 0.501), 1_000, 1_000).state;
    const broken = processIntegrityInput(state, breakInput(10_000), CONFIG);
    expect(broken.triggered).toBe(false);
    state = broken.state;
    const after = feedPositions(Array.from({ length: 9 }, () => 0.502), 11_000, 1_000, state);
    expect(after.results.some(r => r.triggered)).toBe(false);
  });
});

describe('압력 버킷 동역학', () => {
  it('판정 즉시 구간이 오르고 반복 판정이 누적되며 비판정 입력에서는 점진적으로 해소된다', () => {
    const narrow = Array.from({ length: 10 }, (_, i) => 0.5 + (i % 2) * 0.001);
    const first = feedPositions(narrow);
    const hit = first.results.at(-1)!;
    expect(hit.pressureAfter).toBe(CONFIG.pressureStep);
    expect(hit.stageAfter).toBe(1);
    expect(hit.modifier).toBe(CONFIG.midModifier);

    const second = processIntegrityInput(first.state, sample(0.5005, 40_000), CONFIG);
    expect(second.triggered).toBe(true);
    expect(second.pressureAfter).toBe(CONFIG.pressureStep * 2);
    expect(second.stageAfter).toBe(2);
    expect(second.modifier).toBe(CONFIG.highModifier);

    let state = second.state;
    for (let i = 0; i < 10; i++) {
      state = processIntegrityInput(state, sample(i % 2 === 0 ? 0.2 : 0.8, 43_000 + i * 1_000), CONFIG).state;
    }
    const mid = processIntegrityInput(state, sample(0.2, 54_000), CONFIG);
    expect(mid.triggered).toBe(false);
    expect(mid.pressureAfter).toBeCloseTo(CONFIG.pressureStep * 2 - CONFIG.pressureLeak * 11, 12);
    expect(mid.stageAfter).toBe(1);

    state = mid.state;
    for (let i = 0; i < 20; i++) {
      state = processIntegrityInput(state, sample(i % 2 === 0 ? 0.2 : 0.8, 55_000 + i * 1_000), CONFIG).state;
    }
    expect(state.pressure).toBe(0);
    expect(calculateIntegrityModifier(state.pressure, CONFIG)).toBe(1);
  });

  it('break도 비판정 입력으로 연속 창을 끊고 압력을 줄인다', () => {
    const pressured = { pressure: 30, samples: [] };
    const r = processIntegrityInput(pressured, breakInput(1_000), CONFIG);
    expect(r.pressureAfter).toBe(30 - CONFIG.pressureLeak);
    expect(r.modifier).toBe(CONFIG.midModifier);
  });
});

describe('입력 분포 모형 구조 검증(시드 고정)', () => {
  it('입력 분포 모형 A(σ 8~15ms, 정규·균등·라플라스, 세션 길이 조합)에서는 판정하지 않는다', () => {
    const cases: Array<readonly [number, string, number, number]> = [];
    for (const sigma of [8, 12, 15]) {
      for (const dist of ['normal', 'uniform', 'laplace'] as const) {
        for (const count of [20, 50]) {
          const seed = 10_000 + sigma * 100 + count + (dist === 'normal' ? 1 : dist === 'uniform' ? 2 : 3);
          const positions = simulatePositions(seed, dist, sigma, count);
          cases.push([sigma, dist, count, triggersIn(positions)] as const);
        }
      }
    }
    expect(cases).toEqual(expect.arrayContaining([
      expect.arrayContaining([expect.any(Number), expect.any(String), expect.any(Number), 0]),
    ]));
    for (const c of cases) expect(c[3], JSON.stringify(c)).toBe(0);
  });

  it('입력 분포 모형 B/C/D에서는 판정하지 않는다', () => {
    const habit = simulatePositions(77_001, 'normal', 10, 80, 690);
    expect(triggersIn(habit)).toBe(0);

    const rng = mulberry32(77_002);
    const network = Array.from({ length: 80 }, (_, i) =>
      (700 + noise('normal', rng, 8) + Math.sin(i / 3) * 12 + (rng() - 0.5) * 18) / 1400);
    expect(triggersIn(network)).toBe(0);

    const quantized = simulatePositions(77_003, 'normal', 9, 80)
      .map(pos => Math.round(pos * 1400 / 16.7) * 16.7 / 1400);
    expect(triggersIn(quantized)).toBe(0);
  });

  it('break가 섞인 입력 분포 모형 E에서는 판정하지 않는다', () => {
    let state = emptyIntegrityState();
    let triggers = 0;
    let at = 1_000;
    for (let round = 0; round < 6; round++) {
      for (const pos of [0.5, 0.501, 0.5, 0.501, 0.5]) {
        const r = processIntegrityInput(state, sample(pos, at += 1_000), CONFIG);
        triggers += r.triggered ? 1 : 0;
        state = r.state;
      }
      const breaker = processIntegrityInput(state, breakInput(at += 1_000), CONFIG);
      state = breaker.state;
    }
    expect(triggers).toBe(0);
  });

  it('입력 분포 모형 F(σ 2~6ms)는 기준 횟수 이상에서 판정한다', () => {
    for (const sigma of [2, 4, 6]) {
      const positions = simulatePositions(90_000, 'normal', sigma, 200);
      expect(triggersIn(positions), `sigma=${sigma}`).toBeGreaterThan(0);
    }
  });
});
