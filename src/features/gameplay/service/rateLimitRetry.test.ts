import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../core/errors';
import { isRetryExhausted, retryOnRateLimit } from './rateLimitRetry';

const limited = () => new AppError('rate-limited', 'limited', { status: 429 });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('retryOnRateLimit', () => {
  it('성공하면 기다리지 않고 값을 돌려준다', async () => {
    const run = vi.fn(async () => 'ok');
    expect(await retryOnRateLimit(run, new AbortController().signal)).toBe('ok');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('429 뒤 1초를 기다려 다시 시도하고 성공하면 값을 돌려준다', async () => {
    const run = vi.fn().mockRejectedValueOnce(limited()).mockResolvedValueOnce('ok');
    const p = retryOnRateLimit(run, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('대기는 1초, 2초, 4초이고 다시 시도는 3번까지다. 끝내 실패하면 network 실패로 던진다', async () => {
    const run = vi.fn().mockRejectedValue(limited());
    const p = retryOnRateLimit(run, new AbortController().signal).catch(e => e);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(3999);
    expect(run).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(4);
    const err = await p;
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).kind).toBe('network');
    expect(isRetryExhausted(err)).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('429가 아닌 실패는 다시 시도하지 않고 그대로 던진다', async () => {
    const boom = new AppError('server', 'boom');
    const run = vi.fn().mockRejectedValue(boom);
    await expect(retryOnRateLimit(run, new AbortController().signal)).rejects.toBe(boom);
    expect(run).toHaveBeenCalledTimes(1);
    expect(isRetryExhausted(boom)).toBe(false);
  });

  it('대기 중 중단하면 타이머가 남지 않고 더 시도하지 않는다', async () => {
    const run = vi.fn().mockRejectedValue(limited());
    const ctl = new AbortController();
    const p = retryOnRateLimit(run, ctl.signal).catch(e => e);
    await vi.advanceTimersByTimeAsync(0);
    ctl.abort();
    expect(await p).toBeInstanceOf(DOMException);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
