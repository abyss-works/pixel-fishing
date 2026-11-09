// 실행 결과의 형식과 Markdown 표 변환.
import type { EndReason, StepResult } from './recorder';
import type { Summary } from './stats';

export interface RunResult {
  target: string;
  startedAt: string;
  endReason: EndReason;
  /** 채팅 측정이 가능했는지와 그 근거 */
  chatNote: string;
  steps: StepResult[];
}

const REASON_TEXT: Record<EndReason, string> = {
  completed: '완료',
  'error-rate': '오류율 초과',
  probe: 'probe 지연 초과',
  'version-mismatch': '버전 불일치(426)',
  interrupted: '사용자 중단',
};

const num = (v: number | null, digits = 0): string => (v === null ? '-' : v.toFixed(digits));
const pct = (v: number | null): string => (v === null ? '-' : `${(v * 100).toFixed(1)}%`);
const trio = (s: Summary): string => `${num(s.p50)} / ${num(s.p95)} / ${num(s.p99)}`;

export function renderMarkdown(run: RunResult): string {
  const lines: string[] = [
    '# 부하 실행 결과', '',
    `- 대상: ${run.target}`,
    `- 시작: ${run.startedAt}`,
    `- 끝 사유: ${REASON_TEXT[run.endReason]}`,
    `- 채팅: ${run.chatNote}`, '',
    '지연은 모두 ms이고, p50 / p95 / p99 순서다.', '',
    '| 단계 | 연결 | 성공률 | 연결 시간 | 액션/s(유지 구간) | 액션 시간 | 오류율 | 전달 지연 | 받은 메시지 | probe p50 / p95 | probe 실패 | 발생기 CPU 평균 / 최대 | 끝 사유 |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const s of run.steps) {
    lines.push(`| ${s.players} | ${s.connected} | ${pct(s.connect.successRate)} | ${trio(s.connect.ms)} | ${num(s.actions.perSec, 1)} | `
      + `${trio(s.actions.ms)} | ${pct(s.actions.errorRate)} | ${trio(s.broadcast.ms)} | ${s.broadcast.received} | `
      + `${num(s.probe.ms.p50)} / ${num(s.probe.ms.p95)} | ${s.probe.failures} | ${pct(s.generatorCpu.avg)} / ${pct(s.generatorCpu.max)} | ${REASON_TEXT[s.endReason]} |`);
  }
  for (const s of run.steps) {
    lines.push('', `## 단계 ${s.players}`, '',
      `- 유지 시간: ${s.seconds}초, 연결 끊김: ${s.connect.disconnects}, 재연결: ${s.connect.reconnects}, 끊긴 시간: ${s.connect.downSeconds.toFixed(1)}초`,
      `- 액션 상태 코드: ${Object.entries(s.actions.status).map(([k, v]) => `${k}=${v}`).join(', ') || '-'}`,
      `- 채팅: 보냄 ${s.chat.sent}, 게스트 거부 ${s.chat.guestRejected}, 전달 지연 ${trio(s.chat.ms)}`);
    if (s.metrics.length > 0) {
      lines.push('', '메트릭 출력', '');
      for (const m of s.metrics) lines.push(`${m.at}`, '```', m.output.trimEnd(), '```');
    }
  }
  return `${lines.join('\n')}\n`;
}
