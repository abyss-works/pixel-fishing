// 랭킹 핸들러 단위 테스트 — 5개 일반 보드·어종 보드 라우팅, 캐시 헤더, 입력 검증을 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  session: null as { id: string; email: string | null } | null,
};

const boardResult = { top: [], me: null };
const readers = vi.hoisted(() => ({
  fameBoard: vi.fn(async () => boardResult),
  dexBoard: vi.fn(async () => boardResult),
  variantBoard: vi.fn(async () => boardResult),
  namedBoard: vi.fn(async () => boardResult),
  namedClearsBoard: vi.fn(async () => boardResult),
  speciesBoard: vi.fn(async () => boardResult),
}));

vi.mock('./_auth/session.js', () => ({ sessionOf: vi.fn(async () => state.session) }));
vi.mock('./_db/client.js', () => ({ database: () => ({ db: 'DB' }) }));
vi.mock('./_data/rank.js', () => readers);

import handler from './rank.js';

async function callRank(query: Record<string, string | undefined>, method = 'GET') {
  const out = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
  };
  await handler({ method, query, headers: {} } as never, res as never);
  return out;
}

describe('api/rank 핸들러', () => {
  const prevUrl = process.env.DATABASE_URL;
  beforeEach(() => {
    state.session = null;
    process.env.DATABASE_URL = 'postgres://test';
    for (const fn of Object.values(readers)) fn.mockClear();
  });
  afterEach(() => {
    if (prevUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevUrl;
  });

  it('5개 일반 보드를 각 데이터 조회 함수로 연결하고 비로그인 시 60초 공유 캐시 헤더를 둔다', async () => {
    const cases = [
      ['fame', readers.fameBoard],
      ['dex', readers.dexBoard],
      ['variant', readers.variantBoard],
      ['named', readers.namedBoard],
      ['namedClears', readers.namedClearsBoard],
    ] as const;
    for (const [board, fn] of cases) {
      const res = await callRank({ board });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ board, ...boardResult });
      expect(fn).toHaveBeenCalledWith('DB', null);
      expect(res.headers['cache-control']).toContain('s-maxage=60');
    }
  });

  it('로그인 세션이 있으면 uid를 전달하고 캐시하지 않는다', async () => {
    state.session = { id: 'u1', email: 'a@example.test' };
    const res = await callRank({ board: 'namedClears' });
    expect(res.status).toBe(200);
    expect(readers.namedClearsBoard).toHaveBeenCalledWith('DB', 'u1');
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('species 보드는 유효한 어종만 받고 speciesBoard로 연결한다', async () => {
    expect((await callRank({ board: 'species' })).status).toBe(400);
    expect((await callRank({ board: 'species', fish: 'unknown' })).status).toBe(400);
    const res = await callRank({ board: 'species', fish: 'crucian' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ board: 'species', fishId: 'crucian', ...boardResult });
    expect(readers.speciesBoard).toHaveBeenCalledWith('DB', 'crucian', null);
  });

  it('메서드, 보드 이름, DB 환경 변수 오류를 거부한다', async () => {
    expect((await callRank({ board: 'fame' }, 'POST')).status).toBe(405);
    expect((await callRank({ board: 'invalid' })).status).toBe(400);
    delete process.env.DATABASE_URL;
    expect((await callRank({ board: 'fame' })).status).toBe(500);
  });
});
