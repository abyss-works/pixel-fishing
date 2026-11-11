// 미끼 환불 안내 - 영수증이 있으면 첫 화면에서 한 번 뜨고, 닫으면 영수증을 지우는 액션을 보낸다.
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBaitRefund } from './baitRefund';

const receipt = { gold: 200, items: { 'bait-rare': 1 } };
const base = { boat: 0, ready: true, suspended: false };

afterEach(cleanup);

describe('미끼 환불 안내 띄우기', () => {
  it('영수증이 없으면 뜨지 않는다', () => {
    const { result } = renderHook(() => useBaitRefund({ ...base, refund: null, dispatch: vi.fn() }));
    expect(result.current.notice).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it('영수증이 있으면 세이브가 준비된 뒤 뜬다', () => {
    const { result, rerender } = renderHook(({ ready }) => useBaitRefund({ ...base, ready, refund: receipt, dispatch: vi.fn() }),
      { initialProps: { ready: false } });
    expect(result.current.notice).toBeNull();
    rerender({ ready: true });
    expect(result.current.notice?.title).toBe('미끼 환불');
  });

  it('다른 안내 창이 먼저 뜰 차례면 미루고, 끝나면 뜬다. 미루는 동안에도 대기 중이다', () => {
    const { result, rerender } = renderHook(({ suspended }) => useBaitRefund({ ...base, suspended, refund: receipt, dispatch: vi.fn() }),
      { initialProps: { suspended: true } });
    expect(result.current.notice).toBeNull();
    expect(result.current.pending).toBe(true);
    rerender({ suspended: false });
    expect(result.current.notice).not.toBeNull();
  });

  it('닫으면 바로 숨기고 영수증을 지우는 액션을 한 번 보낸다', () => {
    const dispatch = vi.fn().mockResolvedValue({ status: 'ok' });
    const { result } = renderHook(() => useBaitRefund({ ...base, refund: receipt, dispatch }));
    act(() => result.current.close());
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'dismissBaitRefund' });
    expect(result.current.notice).toBeNull();
    expect(result.current.pending).toBe(false);
    act(() => result.current.close());
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('액션이 실패해도 이번 접속에서는 다시 뜨지 않는다', async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useBaitRefund({ ...base, refund: receipt, dispatch }));
    await act(async () => result.current.close());
    expect(result.current.notice).toBeNull();
  });
});
