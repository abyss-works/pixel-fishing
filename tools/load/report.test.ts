import { describe, expect, it } from 'vitest';
import { StepStats, toStepResult } from './recorder';
import { renderMarkdown } from './report';
import type { RunResult } from './report';

describe('StepStats', () => {
  it('2xx와 422는 오류로 세지 않고 나머지는 센다', () => {
    const s = new StepStats();
    for (const status of ['200', '200', '422', '429', '500', 'timeout']) s.recordAction(status, 10);
    expect(s.actions).toBe(6);
    expect(s.actionErrors).toBe(3);
    expect(s.status).toEqual({ '200': 2, '422': 1, '429': 1, '500': 1, timeout: 1 });
  });
});

describe('toStepResult', () => {
  it('측정이 없으면 비율은 null이다', () => {
    const r = toStepResult(new StepStats(), { players: 2, connected: 0, endReason: 'completed' });
    expect(r.connect.successRate).toBeNull();
    expect(r.actions.errorRate).toBeNull();
    expect(r.generatorCpu).toEqual({ avg: null, max: null });
  });

  it('처리량은 유지 구간의 액션만 유지 시간으로 나눈다', () => {
    const s = new StepStats();
    for (let i = 0; i < 30; i++) s.recordAction('200', 5);
    s.markHold(s.startedAt + 20_000);
    for (let i = 0; i < 40; i++) s.recordAction('200', 5);
    const r = toStepResult(s, { players: 5, connected: 5, endReason: 'completed', now: s.startedAt + 30_000 });
    expect(r.actions.total).toBe(70);
    expect(r.actions.perSec).toBe(4);
  });

  it('재연결 횟수와 끊긴 시간을 담는다', () => {
    const s = new StepStats();
    s.reconnects = 2;
    s.downMs = 3500;
    const r = toStepResult(s, { players: 1, connected: 1, endReason: 'completed' });
    expect(r.connect.reconnects).toBe(2);
    expect(r.connect.downSeconds).toBe(3.5);
  });

  it('초당 처리량은 경과 시간으로 나눈다', () => {
    const s = new StepStats();
    for (let i = 0; i < 50; i++) s.recordAction('200', 5);
    const r = toStepResult(s, { players: 5, connected: 5, endReason: 'completed', now: s.startedAt + 10_000 });
    expect(r.actions.perSec).toBe(5);
    expect(r.seconds).toBe(10);
  });
});

describe('renderMarkdown', () => {
  it('단계 표와 끝 사유, 채팅 안내를 담는다', () => {
    const s = new StepStats();
    s.recordAction('200', 12);
    s.connectAttempts = 1; s.connectOk = 1;
    const run: RunResult = {
      target: 'https://stage.example.dev', startedAt: '2026-01-01T00:00:00.000Z', endReason: 'probe',
      chatNote: '게스트 채팅 불가', steps: [toStepResult(s, { players: 1, connected: 1, endReason: 'probe' })],
    };
    const md = renderMarkdown(run);
    expect(md).toContain('https://stage.example.dev');
    expect(md).toContain('probe');
    expect(md).toContain('게스트 채팅 불가');
    expect(md).toContain('| 1 |');
  });
});
