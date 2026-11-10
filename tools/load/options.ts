// 명령줄 옵션을 읽고 검증한다. 필수 옵션에는 기본값을 두지 않는다.
import { parseArgs } from 'node:util';
import { APP_VERSION } from '../../src/version';
import { DEFAULT_LIMITS, parseSteps, parseTarget } from './plan';
import type { AbortLimits } from './plan';

export interface Options {
  target: string;
  steps: number[];
  stepSeconds: number;
  chatRate: number;
  idleRatio: number;
  probe: string | null;
  metricsCmd: string | null;
  limits: AbortLimits;
  out: string;
  /** 미리 만든 익명 세션 파일 */
  accounts: string;
  buildId: string;
  clientVersion: string;
}

const required = (value: string | undefined, flag: string): string => {
  if (!value) throw new Error(`${flag}는 필수입니다`);
  return value;
};

const number = (value: string | undefined, flag: string, fallback: number, min: number, max = Infinity): number => {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${flag} 값이 범위를 벗어났습니다: ${value}`);
  return n;
};

export function parseOptions(argv: string[]): Options {
  const { values } = parseArgs({
    args: argv,
    options: {
      target: { type: 'string' }, steps: { type: 'string' }, 'step-seconds': { type: 'string' },
      'chat-rate': { type: 'string' }, 'idle-ratio': { type: 'string' }, probe: { type: 'string' },
      'metrics-cmd': { type: 'string' }, 'abort-error-rate': { type: 'string' }, 'abort-probe-ms': { type: 'string' },
      out: { type: 'string' }, 'build-id': { type: 'string' }, accounts: { type: 'string' }, 'client-version': { type: 'string' },
    },
    strict: true,
  });
  return {
    target: parseTarget(required(values.target, '--target')),
    steps: parseSteps(values.steps ?? '10,25,50,100'),
    stepSeconds: number(values['step-seconds'], '--step-seconds', 120, 1),
    chatRate: number(values['chat-rate'], '--chat-rate', 1, 0, 600),
    idleRatio: number(values['idle-ratio'], '--idle-ratio', 0.3, 0, 1),
    probe: values.probe ? parseTarget(values.probe, { allowProd: true }) : null,
    metricsCmd: values['metrics-cmd'] ?? null,
    limits: {
      ...DEFAULT_LIMITS,
      errorRate: number(values['abort-error-rate'], '--abort-error-rate', DEFAULT_LIMITS.errorRate, 0, 1),
      probeMs: number(values['abort-probe-ms'], '--abort-probe-ms', DEFAULT_LIMITS.probeMs, 1),
    },
    out: required(values.out, '--out'),
    accounts: required(values.accounts, '--accounts'),
    buildId: required(values['build-id'], '--build-id'),
    clientVersion: values['client-version'] ?? APP_VERSION,
  };
}
