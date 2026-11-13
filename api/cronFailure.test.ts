// 예약 작업 실패 기록 규약 — 실패 단계 표식과 error 로그의 내용을 검사한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { failureStage, inStage, logCronFailure } from './cronFailure.js';

function recorded(spy: ReturnType<typeof vi.spyOn>) {
  expect(spy).toHaveBeenCalledTimes(1);
  const [text, json] = spy.mock.calls[0] as [string, string];
  return { text, fields: JSON.parse(json) as Record<string, unknown> };
}

describe('inStage', () => {
  it('성공하면 결과를 그대로 돌려준다', async () => {
    await expect(inStage('a', async () => 7)).resolves.toBe(7);
  });

  it('실패하면 같은 오류 객체를 다시 던지고 단계를 표시한다', async () => {
    const failure = new Error('boom');
    await expect(inStage('r2-upload', async () => { throw failure; })).rejects.toBe(failure);
    expect(failureStage(failure)).toBe('r2-upload');
  });

  it('안쪽 단계가 먼저 표시되며 바깥 단계가 덮어쓰지 않는다', async () => {
    const failure = new Error('boom');
    await expect(inStage('archive', () => inStage('saves-upload', async () => { throw failure; }))).rejects.toBe(failure);
    expect(failureStage(failure)).toBe('saves-upload');
  });

  it('객체가 아닌 값이 던져져도 그대로 전달하고 단계는 없다', async () => {
    await expect(inStage('a', async () => { throw 'text'; })).rejects.toBe('text');
    expect(failureStage('text')).toBeUndefined();
  });
});

describe('logCronFailure', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('작업 이름, 단계, 오류 이름과 코드, 메시지, 스택을 error 수준으로 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = Object.assign(new Error('write failed'), { code: 'ENOSPC' });
    await inStage('saves-stage-file', async () => { throw failure; }).catch(() => undefined);
    logCronFailure('archive', failure, 'unknown');
    const { text, fields } = recorded(spy);
    expect(text).toBe('예약 작업이 실패했습니다 (작업 archive, 단계 saves-stage-file)');
    expect(fields).toMatchObject({ job: 'archive', stage: 'saves-stage-file', name: 'Error', code: 'ENOSPC', message: 'write failed' });
    expect(String(fields.stack)).toContain('write failed');
  });

  it('단계 표시가 없으면 호출자가 준 기본 단계를 쓴다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logCronFailure('archive', new Error('x'), 'setup');
    expect(recorded(spy).fields.stage).toBe('setup');
  });

  it('원인 오류의 이름, 코드, 메시지를 함께 남긴다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cause = Object.assign(new Error('connect reset'), { code: 'ECONNRESET' });
    logCronFailure('archive', new TypeError('fetch failed', { cause }), 'x');
    expect(recorded(spy).fields.causes).toEqual([{ name: 'Error', code: 'ECONNRESET', message: 'connect reset' }]);
  });

  it('쿼리 인자는 메시지와 스택에서 가린다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('Failed query: select 1\nparams: user-secret-id,42');
    logCronFailure('archive', failure, 'x');
    const { fields } = recorded(spy);
    expect(JSON.stringify(fields)).not.toContain('user-secret-id');
    expect(String(fields.message)).toContain('Failed query: select 1');
  });

  it('Error가 아닌 값도 기록한다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logCronFailure('archive', 'plain text', 'x');
    expect(recorded(spy).fields).toMatchObject({ name: 'string', message: 'plain text' });
  });
});
