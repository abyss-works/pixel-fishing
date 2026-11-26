// 운세 이력 어댑터 — /api/fortune/history 월별 호출과 실패 전파, 로컬 모드 null 반환을 검증한다.
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
    await expect(readFortuneHistory('2030-03')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('month 미지정과 지정 호출 모두 응답(discovered 포함)을 그대로 돌려준다', async () => {
    const payload = {
      month: '2030-03',
      firstMonth: '2030-02',
      currentDay: '2030-03-04',
      today: { day: '2030-03-04', kind: 'fish', index: 5 },
      days: [{ day: '2030-03-04', kind: 'fish', index: 5 }],
      discovered: [{ kind: 'fish', index: 5, count: 2, firstDay: '2030-02-14' }],
    };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
    await expect(readFortuneHistory()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/fortune/history');

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
    await expect(readFortuneHistory('2030-02')).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/fortune/history?month=2030-02');
  });

  it('discovered가 누락된 응답은 빈 배열로 정규화한다', async () => {
    const legacyPayload = {
      month: '2030-03',
      firstMonth: '2030-02',
      currentDay: '2030-03-04',
      today: null,
      days: [],
    };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(legacyPayload), { status: 200 }));
    await expect(readFortuneHistory()).resolves.toEqual({ ...legacyPayload, discovered: [] });
  });

  it('실패 응답은 AppError로 던진다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'account-only' }), { status: 403 }));
    await expect(readFortuneHistory()).rejects.toMatchObject({ name: 'AppError', kind: 'network' });

    fetchMock.mockResolvedValue(new Response('too many', { status: 429 }));
    await expect(readFortuneHistory('2030-03')).rejects.toMatchObject({ name: 'AppError', kind: 'rate-limited' });
  });
});
