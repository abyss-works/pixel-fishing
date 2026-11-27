// 서버 전용 추첨 보정 계통의 순수 규칙.
// 이 파일에는 구조만 둔다. 임계·구간·배수의 실제 값은 런타임 설정으로 주입하고 저장소에 두지 않는다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 이 체인을 직접 불러온다.

export interface IntegrityConfig {
  /** 연속 입력 위치의 최대 총폭(max-min). 이보다 좁은 창만 신호로 본다 */
  spanMax: number;
  /** 한 창을 이루는 연속 입력 수 */
  runLength: number;
  /** 같은 연속으로 인정하는 입력 간격 상한(ms) */
  sessionGapMs: number;
  /** 발동 한 번의 압력 증가량 */
  pressureStep: number;
  /** 발동 없는 유효 입력 한 번의 압력 누수량 */
  pressureLeak: number;
  /** 중간 구간 진입 압력 */
  midPressure: number;
  /** 높은 구간 진입 압력 */
  highPressure: number;
  /** 중간 구간 배수 */
  midModifier: number;
  /** 높은 구간 배수 */
  highModifier: number;
}

export interface IntegritySample {
  pos: number;
  at: number;
}

export interface IntegrityState {
  pressure: number;
  samples: IntegritySample[];
}

export type IntegrityInput =
  | { kind: 'sample'; pos: number; at: number }
  | { kind: 'break'; at: number };

export interface IntegritySignal {
  detector: 'input-window';
  runLength: number;
  span: number;
  startedAt: number;
  endedAt: number;
  positions: number[];
}

export interface IntegrityEvaluation {
  stateBefore: IntegrityState;
  state: IntegrityState;
  stateChanged: boolean;
  triggered: boolean;
  signal: IntegritySignal | null;
  pressureBefore: number;
  pressureAfter: number;
  stageBefore: number;
  stageAfter: number;
  modifier: number;
}

export const emptyIntegrityState = (): IntegrityState => ({ pressure: 0, samples: [] });

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** 저장 표에서 읽은 값을 순수 상태로 위생 처리한다. 모르는 값은 빈 상태로 둔다 */
export function sanitizeIntegrityState(raw: unknown): IntegrityState {
  if (typeof raw !== 'object' || raw === null) return emptyIntegrityState();
  const value = raw as { pressure?: unknown; samples?: unknown };
  const pressure = finite(value.pressure) && value.pressure > 0 ? value.pressure : 0;
  const samples = Array.isArray(value.samples)
    ? value.samples.flatMap(sample => {
      if (typeof sample !== 'object' || sample === null) return [];
      const s = sample as { pos?: unknown; at?: unknown };
      return finite(s.pos) && finite(s.at) ? [{ pos: s.pos, at: s.at }] : [];
    })
    : [];
  return { pressure, samples };
}

/** JSON 문자열 또는 객체로 주입된 설정을 검증한다. 하나라도 어긋나면 계통을 비활성화하는 null이다 */
export function parseIntegrityConfig(raw: unknown): IntegrityConfig | null {
  if (raw === undefined || raw === null || raw === '') return null;
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { return null; }
  }
  if (typeof value !== 'object' || value === null) return null;
  const c = value as Record<keyof IntegrityConfig, unknown>;
  if (!finite(c.spanMax) || c.spanMax <= 0) return null;
  if (!Number.isInteger(c.runLength) || (c.runLength as number) < 2 || (c.runLength as number) > 64) return null;
  if (!finite(c.sessionGapMs) || c.sessionGapMs <= 0) return null;
  if (!finite(c.pressureStep) || c.pressureStep <= 0) return null;
  if (!finite(c.pressureLeak) || c.pressureLeak <= 0) return null;
  if (!finite(c.midPressure) || c.midPressure <= 0) return null;
  if (!finite(c.highPressure) || c.highPressure <= c.midPressure) return null;
  if (!finite(c.midModifier) || c.midModifier <= 0 || c.midModifier > 1) return null;
  if (!finite(c.highModifier) || c.highModifier <= 0 || c.highModifier > c.midModifier) return null;
  return {
    spanMax: c.spanMax,
    runLength: c.runLength as number,
    sessionGapMs: c.sessionGapMs,
    pressureStep: c.pressureStep,
    pressureLeak: c.pressureLeak,
    midPressure: c.midPressure,
    highPressure: c.highPressure,
    midModifier: c.midModifier,
    highModifier: c.highModifier,
  };
}

export function integrityStageOf(pressure: number, config: IntegrityConfig): number {
  if (pressure >= config.highPressure) return 2;
  if (pressure >= config.midPressure) return 1;
  return 0;
}

/** 구간을 최종 확률 배수로 매핑한다. 낮은 구간은 항상 중립이다 */
export function integrityModifierOfStage(stage: number, config: IntegrityConfig): number {
  if (stage === 2) return config.highModifier;
  if (stage === 1) return config.midModifier;
  return 1;
}

/** 압력을 최종 확률 배수로 매핑한다. 낮은 구간은 항상 중립이다 */
export function calculateIntegrityModifier(pressure: number, config: IntegrityConfig): number {
  return integrityModifierOfStage(integrityStageOf(pressure, config), config);
}

const sameSamples = (a: readonly IntegritySample[], b: readonly IntegritySample[]): boolean =>
  a.length === b.length && a.every((s, i) => s.pos === b[i].pos && s.at === b[i].at);

/**
 * 입력 하나를 압력 버킷에 반영한다.
 * sample은 위치를 가진 유효 수동 입력, break는 auto 캐치·위치 없는 캐치·다른 조작이다.
 * 발동하지 않은 sample만 누수로 본다 — break는 연속을 끊기만 하고 해소량을 주지 않는다.
 */
export function processIntegrityInput(
  current: IntegrityState,
  input: IntegrityInput,
  config: IntegrityConfig,
): IntegrityEvaluation {
  const before = sanitizeIntegrityState(current);
  const pressureBefore = before.pressure;
  const stageBefore = integrityStageOf(pressureBefore, config);

  if (input.kind === 'break') {
    const pressureAfter = Math.max(0, pressureBefore - config.pressureLeak);
    const stageAfter = integrityStageOf(pressureAfter, config);
    const state: IntegrityState = { pressure: pressureAfter, samples: [] };
    return {
      stateBefore: before,
      state,
      stateChanged: pressureAfter !== pressureBefore || before.samples.length > 0,
      triggered: false,
      signal: null,
      pressureBefore,
      pressureAfter,
      stageBefore,
      stageAfter,
      modifier: calculateIntegrityModifier(pressureAfter, config),
    };
  }

  const prev = before.samples.at(-1);
  const gap = prev ? input.at - prev.at : 0;
  const continuous = prev !== undefined && gap >= 0 && gap <= config.sessionGapMs;
  const nextSamples = [...(continuous ? before.samples : []), { pos: input.pos, at: input.at }]
    .slice(-config.runLength);

  let triggered = false;
  let signal: IntegritySignal | null = null;
  if (nextSamples.length >= config.runLength) {
    const window = nextSamples.slice(-config.runLength);
    const positions = window.map(s => s.pos);
    const span = Math.max(...positions) - Math.min(...positions);
    if (span > 0 && span <= config.spanMax) {
      triggered = true;
      signal = {
        detector: 'input-window',
        runLength: config.runLength,
        span,
        startedAt: window[0].at,
        endedAt: window.at(-1)!.at,
        positions,
      };
    }
  }

  const pressureAfter = triggered
    ? pressureBefore + config.pressureStep
    : Math.max(0, pressureBefore - config.pressureLeak);
  const stageAfter = integrityStageOf(pressureAfter, config);
  const state: IntegrityState = { pressure: pressureAfter, samples: nextSamples };
  return {
    stateBefore: before,
    state,
    stateChanged: pressureAfter !== pressureBefore || !sameSamples(nextSamples, before.samples),
    triggered,
    signal,
    pressureBefore,
    pressureAfter,
    stageBefore,
    stageAfter,
    modifier: calculateIntegrityModifier(pressureAfter, config),
  };
}
