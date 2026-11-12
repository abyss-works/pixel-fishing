// 계정 관리 창이 쓰는 로그인 방식 — 게스트는 바로, 영구 계정은 붙은 로그인 수단을 읽은 뒤 정한다.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ providers: vi.fn() }));

vi.mock('../../../platform/api', () => ({
  api: { auth: { isConfigured: true, accountProviders: auth.providers } },
}));

import { useLoginMethod } from './useLoginMethod';

describe('로그인 방식 읽기', () => {
  beforeEach(() => auth.providers.mockReset());
  afterEach(cleanup);

  it('게스트는 수단을 조회하지 않고 바로 게스트다', () => {
    const { result } = renderHook(() => useLoginMethod(null));
    expect(result.current).toMatchObject({ method: 'guest', failed: false });
    expect(auth.providers).not.toHaveBeenCalled();
  });

  it('구글이 붙은 계정은 읽는 동안 모르는 상태(실패 아님)이고 읽은 뒤 구글이 된다', async () => {
    auth.providers.mockResolvedValue(['google']);
    const { result } = renderHook(() => useLoginMethod('a@gmail.com'));
    expect(result.current).toMatchObject({ method: null, failed: false });
    await waitFor(() => expect(result.current.method).toBe('google'));
  });

  it('비밀번호 수단만 있는 계정은 이메일이다', async () => {
    auth.providers.mockResolvedValue(['credential']);
    const { result } = renderHook(() => useLoginMethod('a@example.com'));
    await waitFor(() => expect(result.current.method).toBe('email'));
  });

  it('조회가 실패하면 모르는 상태로 남고 실패로 알린다', async () => {
    auth.providers.mockResolvedValue(null);
    const { result } = renderHook(() => useLoginMethod('a@example.com'));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.method).toBeNull();
  });

  it('다시 시도하면 실패를 지우고 다시 읽는다', async () => {
    auth.providers.mockResolvedValueOnce(null).mockResolvedValueOnce(['credential']);
    const { result } = renderHook(() => useLoginMethod('a@example.com'));
    await waitFor(() => expect(result.current.failed).toBe(true));
    act(() => result.current.retry());
    expect(result.current.failed).toBe(false);
    await waitFor(() => expect(result.current.method).toBe('email'));
    expect(auth.providers).toHaveBeenCalledTimes(2);
  });
});
