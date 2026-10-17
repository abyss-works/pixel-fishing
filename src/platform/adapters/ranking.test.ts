// 랭킹 읽기 — 서버 읽기 함수를 세션 토큰과 함께 부르고, 실패를 빈 값으로 숨기지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ session: null as { access_token: string } | null }));
vi.mock('./auth', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: state.session } }) } },
}));

import { readRanking } from './ranking';

describe('readRanking', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    state.session = { access_token: 'tok' };
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('세션 토큰을 붙여 표를 읽는다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ board: 'fame', top: [], me: null }), { status: 200 }));
    await expect(readRanking('fame')).resolves.toEqual({ board: 'fame', top: [], me: null });
    expect(fetchMock).toHaveBeenCalledWith('/api/rank?board=fame', { headers: { authorization: 'Bearer tok' } });
  });

  it('세션이 없으면 토큰 없이 읽는다', async () => {
    state.session = null;
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ board: 'biggest', species: [] }), { status: 200 }));
    await readRanking('biggest');
    expect(fetchMock).toHaveBeenCalledWith('/api/rank?board=biggest', { headers: {} });
  });

  it('실패 응답은 오류로 던진다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'db-read' }), { status: 500 }));
    await expect(readRanking('dex')).rejects.toMatchObject({ name: 'AppError', kind: 'network' });
  });
});
