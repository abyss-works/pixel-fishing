// 부하 실행의 입력 검증과 중단 판정. 네트워크를 쓰지 않는 순수 함수만 둔다.
import { percentile } from './stats';

/** 운영 도메인. 부하 대상으로는 거부하고, 감시용 probe에만 허용한다 */
export const PROD_HOST = 'pixel-fishing.abyssworks.dev';

/** 주소를 origin으로 정리한다. 운영 도메인은 allowProd가 아니면 거부한다 */
export function parseTarget(raw: string, opts: { allowProd?: boolean } = {}): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`주소 형식이 올바르지 않습니다: ${raw}`); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`http 또는 https 주소만 쓸 수 있습니다: ${raw}`);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === PROD_HOST && !opts.allowProd) throw new Error(`운영 도메인(${PROD_HOST})에는 부하를 보내지 않습니다`);
  return url.origin;
}

/** 단계별 동시 플레이어 수. 양의 정수이고 앞 단계보다 커야 한다 */
export function parseSteps(raw: string): number[] {
  const steps = raw.split(',').map(s => s.trim()).map(s => (/^\d+$/.test(s) ? Number(s) : NaN));
  if (steps.length === 0 || steps.some(n => !Number.isInteger(n) || n < 1)) throw new Error(`--steps는 양의 정수 목록이어야 합니다: ${raw}`);
  for (let i = 1; i < steps.length; i++) {
    if ((steps[i] as number) <= (steps[i - 1] as number)) throw new Error(`--steps는 단계마다 증가해야 합니다: ${raw}`);
  }
  return steps;
}

export interface AbortLimits {
  /** 단계 안의 액션 오류율 상한 */
  errorRate: number;
  /** probe 지연 p95 상한(ms) */
  probeMs: number;
  /** 오류율을 판정하기 시작하는 최소 액션 수 */
  minActions: number;
  /** probe를 판정하기 시작하는 최소 표본 수 */
  minProbes: number;
}

export const DEFAULT_LIMITS: AbortLimits = { errorRate: 0.05, probeMs: 1500, minActions: 20, minProbes: 3 };

export type AbortKind = 'error-rate' | 'probe';

/** 지금 단계의 액션 수, 오류 수, probe 지연으로 중단 여부를 판정한다. 오류율을 먼저 본다 */
export function abortReason(
  now: { actions: number; errors: number; probeMs: readonly number[] }, limits: AbortLimits,
): AbortKind | null {
  if (now.actions >= limits.minActions && now.errors / now.actions > limits.errorRate) return 'error-rate';
  if (now.probeMs.length >= limits.minProbes) {
    const p95 = percentile(now.probeMs, 95) as number;
    if (p95 > limits.probeMs) return 'probe';
  }
  return null;
}
