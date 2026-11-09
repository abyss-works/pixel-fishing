// 단계 하나의 측정값 보관과 결과 변환.
import { SampleSet, summarize } from './stats';
import type { Summary } from './stats';

export interface MetricsOutput { at: string; output: string }

export class StepStats {
  readonly startedAt = Date.now();
  connectAttempts = 0;
  connectOk = 0;
  /** 연결된 뒤 서버가 닫은 연결 수 */
  disconnects = 0;
  readonly connectMs = new SampleSet();
  /** 끊긴 실시간 채널을 다시 연결한 횟수와 끊겨 있던 시간(ms 합) */
  reconnects = 0;
  downMs = 0;
  /** 유지 구간이 시작된 시각과 그때까지의 액션 수. 처리량은 이 구간만으로 계산한다 */
  private holdAt: number | null = null;
  private holdActions = 0;

  markHold(now: number = Date.now()): void {
    this.holdAt = now;
    this.holdActions = this.actions;
  }

  /** 유지 구간의 초당 액션 수. 유지 구간에 들어가지 못했으면(증원 중 중단) 단계 전체로 계산한다 */
  throughput(now: number): number {
    if (this.holdAt === null) return this.actions / Math.max(1, (now - this.startedAt) / 1000);
    return (this.actions - this.holdActions) / Math.max(1, (now - this.holdAt) / 1000);
  }
  actions = 0;
  actionErrors = 0;
  readonly actionMs = new SampleSet();
  readonly status: Record<string, number> = {};
  readonly broadcastMs = new SampleSet();
  /** 실시간 채널에서 받은 메시지 수 */
  received = 0;
  chatSent = 0;
  readonly chatMs = new SampleSet();
  chatGuestRejected = 0;
  readonly probeMs: number[] = [];
  probeFailures = 0;
  readonly metrics: MetricsOutput[] = [];
  readonly cpu: number[] = [];

  /** 액션 응답 하나. 2xx와 규칙 거부(422) 밖의 응답과 네트워크 실패는 오류다 */
  recordAction(status: string, ms: number): void {
    this.actions++;
    this.actionMs.add(ms);
    this.status[status] = (this.status[status] ?? 0) + 1;
    if (!/^2\d\d$/.test(status) && status !== '422') this.actionErrors++;
  }
}

export type EndReason = 'completed' | 'error-rate' | 'probe' | 'version-mismatch' | 'interrupted';

export interface StepResult {
  players: number;
  connected: number;
  seconds: number;
  connect: { attempts: number; ok: number; successRate: number | null; ms: Summary; disconnects: number; reconnects: number; downSeconds: number };
  actions: { total: number; perSec: number; errors: number; errorRate: number | null; ms: Summary; status: Record<string, number> };
  broadcast: { received: number; ms: Summary };
  chat: { sent: number; guestRejected: number; ms: Summary };
  probe: { ms: Summary; failures: number };
  metrics: MetricsOutput[];
  generatorCpu: { avg: number | null; max: number | null };
  endReason: EndReason;
}

const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);

export function toStepResult(s: StepStats, meta: { players: number; connected: number; endReason: EndReason; now?: number }): StepResult {
  const seconds = Math.max(1, ((meta.now ?? Date.now()) - s.startedAt) / 1000);
  return {
    players: meta.players,
    connected: meta.connected,
    seconds: Math.round(seconds),
    connect: {
      attempts: s.connectAttempts, ok: s.connectOk, successRate: ratio(s.connectOk, s.connectAttempts),
      ms: s.connectMs.summary(), disconnects: s.disconnects, reconnects: s.reconnects, downSeconds: s.downMs / 1000,
    },
    actions: {
      total: s.actions, perSec: s.throughput(meta.now ?? Date.now()), errors: s.actionErrors, errorRate: ratio(s.actionErrors, s.actions),
      ms: s.actionMs.summary(), status: { ...s.status },
    },
    broadcast: { received: s.received, ms: s.broadcastMs.summary() },
    chat: { sent: s.chatSent, guestRejected: s.chatGuestRejected, ms: s.chatMs.summary() },
    probe: { ms: summarize(s.probeMs), failures: s.probeFailures },
    metrics: s.metrics,
    generatorCpu: s.cpu.length === 0 ? { avg: null, max: null }
      : { avg: s.cpu.reduce((a, b) => a + b, 0) / s.cpu.length, max: Math.max(...s.cpu) },
    endReason: meta.endReason,
  };
}
