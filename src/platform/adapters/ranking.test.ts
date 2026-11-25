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
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ board, top: [], me: null }), { status: 200 }));
      await expect(readRanking(board)).resolves.toEqual({ board, top: [], me: null });
      expect(fetchMock).toHaveBeenLastCalledWith(`/api/rank?board=${board}`);
    }
  });

  it('어종 순위는 어종 id를 붙인다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ board: 'species', fishId: 'carp', top: [], me: null }), { status: 200 }));
    await readRanking('species', 'carp');
    expect(fetchMock).toHaveBeenCalledWith('/api/rank?board=species&fish=carp');
  });

  it('실패 응답은 오류로 던진다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'db-read' }), { status: 500 }));
    await expect(readRanking('dex')).rejects.toMatchObject({ name: 'AppError', kind: 'network' });
  });
});
