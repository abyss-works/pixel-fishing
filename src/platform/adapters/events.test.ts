// 라이브 이벤트 어댑터 — /api/events 호출과 실패 전파, 로컬 모드 null 반환을 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = { isCloud: true };
vi.mock('./auth', () => ({
  get isCloud() { return authState.isCloud; },
}));

import { readEvents } from './events';

describe('readEvents', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    authState.isCloud = true;
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('로컬 모드에서는 요청하지 않고 null을 돌려준다', async () => {
    authState.isCloud = false;
    await expect(readEvents()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('클라우드 모드에서는 /api/events 응답을 그대로 돌려준다', async () => {
    const payload = {
      now: '2030-03-04T00:00:00.000Z',
      events: [],
      trio: null,
      championship: null,
      draw: null,
    };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
    await expect(readEvents()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith('/api/events');
  });

  it('실패 응답은 AppError로 던진다', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }));
    await expect(readEvents()).rejects.toMatchObject({ name: 'AppError', kind: 'network' });

    fetchMock.mockResolvedValueOnce(new Response('too many', { status: 429 }));
    await expect(readEvents()).rejects.toMatchObject({ name: 'AppError', kind: 'rate-limited' });
  });
});
