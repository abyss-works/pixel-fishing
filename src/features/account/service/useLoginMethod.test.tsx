// 계정 관리 창이 쓰는 로그인 방식 — 게스트는 바로, 영구 계정은 붙은 로그인 수단을 읽은 뒤 정한다.
import { cleanup, renderHook, waitFor } from '@testing-library/react';
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
    expect(result.current).toBe('guest');
    expect(auth.providers).not.toHaveBeenCalled();
  });

  it('구글이 붙은 계정은 읽은 뒤 구글이 된다', async () => {
    auth.providers.mockResolvedValue(['google']);
    const { result } = renderHook(() => useLoginMethod('a@gmail.com'));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('google'));
  });

  it('비밀번호 수단만 있는 계정은 이메일이다', async () => {
    auth.providers.mockResolvedValue(['credential']);
    const { result } = renderHook(() => useLoginMethod('a@example.com'));
    await waitFor(() => expect(result.current).toBe('email'));
  });

  it('조회가 실패하면 모르는 상태로 남는다', async () => {
    auth.providers.mockResolvedValue(null);
    const { result } = renderHook(() => useLoginMethod('a@example.com'));
    await waitFor(() => expect(auth.providers).toHaveBeenCalledTimes(1));
    expect(result.current).toBeNull();
  });
});
