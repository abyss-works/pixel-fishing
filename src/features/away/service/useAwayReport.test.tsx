// 방치 결과 보고 훅 — 돌아오면 요약을 읽어 잡은 물고기가 있을 때 한 줄을 남기고, 10분 이상이면 결과 카드를 띄운다.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readAwayReport = vi.hoisted(() => vi.fn());
const watchAway = vi.hoisted(() => vi.fn());
vi.mock('../../../platform/api', () => ({ readAwayReport, watchAway }));

import { useAwayReport } from './useAwayReport';

let back: (awayMs: number) => void = () => {};
const stop = vi.fn();

beforeEach(() => {
  readAwayReport.mockReset();
  watchAway.mockReset().mockImplementation((cb: (ms: number) => void) => { back = cb; return stop; });
});
afterEach(cleanup);

describe('useAwayReport', () => {
  it('10분 이상 비웠고 잡은 물고기가 있으면 한 줄을 남기고 카드를 띄운다. 닫으면 내린다', async () => {
    const summary = { catches: 3 };
    readAwayReport.mockResolvedValue(summary);
    const onLine = vi.fn();
    const { result } = renderHook(() => useAwayReport(onLine));
    act(() => back(10 * 60_000));
    await waitFor(() => expect(result.current.report).toBe(summary));
    expect(readAwayReport).toHaveBeenCalledWith(10 * 60_000);
    expect(onLine).toHaveBeenCalledWith(summary);
    act(() => result.current.dismiss());
    expect(result.current.report).toBeNull();
  });

  it('10분 미만이면 한 줄만 남긴다', async () => {
    readAwayReport.mockResolvedValue({ catches: 2 });
    const onLine = vi.fn();
    const { result } = renderHook(() => useAwayReport(onLine));
    act(() => back(9 * 60_000));
    await waitFor(() => expect(onLine).toHaveBeenCalledTimes(1));
    expect(result.current.report).toBeNull();
  });

  it('잡은 물고기가 없거나 요약이 없으면(로컬) 아무것도 하지 않는다', async () => {
    readAwayReport.mockResolvedValueOnce({ catches: 0 }).mockResolvedValueOnce(null);
    const onLine = vi.fn();
    const { result } = renderHook(() => useAwayReport(onLine));
    await act(async () => { back(60 * 60_000); });
    await act(async () => { back(60 * 60_000); });
    expect(readAwayReport).toHaveBeenCalledTimes(2);
    expect(onLine).not.toHaveBeenCalled();
    expect(result.current.report).toBeNull();
  });

  it('읽기 실패는 보고 없이 넘어간다', async () => {
    readAwayReport.mockRejectedValue(new Error('network'));
    const onLine = vi.fn();
    const { result } = renderHook(() => useAwayReport(onLine));
    await act(async () => { back(60 * 60_000); });
    expect(onLine).not.toHaveBeenCalled();
    expect(result.current.report).toBeNull();
  });

  it('사라지면 지켜보기를 멈춘다', () => {
    const { unmount } = renderHook(() => useAwayReport(vi.fn()));
    unmount();
    expect(stop).toHaveBeenCalled();
  });
});
