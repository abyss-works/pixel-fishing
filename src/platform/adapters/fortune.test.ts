// 운세 이력 어댑터 — /api/fortune/history 호출과 실패 전파, 로컬 모드 null 반환을 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = { isCloud: true };
vi.mock('./auth', () => ({
  get isCloud() { return authState.isCloud; },
}));

import { readFortuneHistory } from './fortune';

describe('readFortuneHistory', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    authState.isCloud = true;
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('로컬 모드에서는 요청하지 않고 null을 돌려준다', async () => {
    authState.isCloud = false;
    await expect(readFortuneHistory()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('GET /api/fortune/history 응답을 그대로 돌려준다', async () => {
    const payload = {
      today: { day: '2030-03-04', kind: 'fish', index: 5 },
      history: [{ day: '2030-03-04', kind: 'fish', index: 5 }],
      currentDay: '2030-03-04',
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    await expect(readFortuneHistory()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith('/api/fortune/history');
  });

  it('실패 응답은 AppError로 던진다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'account-only' }), { status: 403 }));
    await expect(readFortuneHistory()).rejects.toMatchObject({ name: 'AppError', kind: 'network' });

    fetchMock.mockResolvedValue(new Response('too many', { status: 429 }));
    await expect(readFortuneHistory()).rejects.toMatchObject({ name: 'AppError', kind: 'rate-limited' });
  });
});
