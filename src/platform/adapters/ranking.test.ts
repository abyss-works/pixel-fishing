// 랭킹 읽기 — 서버 읽기 함수를 부르고(세션은 쿠키가 싣는다), 실패를 빈 값으로 숨기지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({ isCloud: true }));

import { readRanking } from './ranking';

describe('readRanking', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('표를 읽는다. 인증 헤더는 붙이지 않는다', async () => {
    for (const board of ['fame', 'dex', 'variant', 'named', 'namedClears'] as const) {
      const payload = { board, window: 'all', periodSupported: false, resetAt: null, top: [], me: null };
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
      await expect(readRanking(board)).resolves.toEqual(payload);
      expect(fetchMock).toHaveBeenLastCalledWith(`/api/rank?board=${board}`);
    }
  });

  it('window를 지정하면 질의 문자열에 포함한다', async () => {
    const payload = {
      board: 'fame',
      window: 'weekly',
      periodSupported: true,
      resetAt: '2026-11-29T19:00:00.000Z',
      top: [],
      me: null,
    };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
    await expect(readRanking('fame', undefined, 'weekly')).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/rank?board=fame&window=weekly');

    const allPayload = {
      board: 'namedClears',
      window: 'all',
      periodSupported: true,
      resetAt: null,
      top: [],
      me: null,
    };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(allPayload), { status: 200 }));
    await expect(readRanking('namedClears', undefined, 'all')).resolves.toEqual(allPayload);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/rank?board=namedClears&window=all');
  });

  it('어종 순위는 어종 id를 붙인다', async () => {
    const payload = { board: 'species', fishId: 'carp', window: 'all', periodSupported: false, resetAt: null, top: [], me: null };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    await readRanking('species', 'carp');
    expect(fetchMock).toHaveBeenCalledWith('/api/rank?board=species&fish=carp');
  });

  it('실패 응답은 오류로 던진다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'db-read' }), { status: 500 }));
    await expect(readRanking('dex')).rejects.toMatchObject({ name: 'AppError', kind: 'network' });
  });
});
