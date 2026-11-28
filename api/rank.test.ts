// 랭킹 핸들러 단위 테스트 — 보드별 기간 지원 여부·기본 window·주차 파라미터·캐시 헤더·입력 검증을 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  session: null as { id: string; email: string | null } | null,
};

const weeklyBoardResult = {
  top: [],
  me: null,
  window: 'weekly' as const,
  periodSupported: true,
  resetAt: '2026-11-29T19:00:00.000Z',
  weekStart: '2026-11-23',
  availableWeeks: ['2026-11-23'],
};
const allBoardResult = {
  top: [],
  me: null,
  window: 'all' as const,
  periodSupported: false,
  resetAt: null,
  weekStart: null,
  availableWeeks: [] as string[],
};
const readers = vi.hoisted(() => ({
  fameBoard: vi.fn(async (_db: unknown, _uid: unknown, window = 'weekly', _nowIso?: string, weekStart?: string) => ({
    ...weeklyBoardResult,
    window,
    resetAt: window === 'weekly' && !weekStart ? '2026-11-29T19:00:00.000Z' : null,
    weekStart: window === 'weekly' ? (weekStart ?? '2026-11-23') : null,
    availableWeeks: window === 'weekly' ? ['2026-11-23', '2026-11-16'] : [],
  })),
  sellGoldBoard: vi.fn(async (_db: unknown, _uid: unknown, window = 'weekly', _nowIso?: string, weekStart?: string) => ({
    ...weeklyBoardResult,
    window,
    resetAt: window === 'weekly' && !weekStart ? '2026-11-29T19:00:00.000Z' : null,
    weekStart: window === 'weekly' ? (weekStart ?? '2026-11-23') : null,
    availableWeeks: window === 'weekly' ? ['2026-11-23', '2026-11-16'] : [],
  })),
  dexBoard: vi.fn(async () => allBoardResult),
  variantBoard: vi.fn(async () => allBoardResult),
  namedBoard: vi.fn(async () => allBoardResult),
  namedClearsBoard: vi.fn(async (_db: unknown, _uid: unknown, window = 'weekly', _nowIso?: string, weekStart?: string) => ({
    ...weeklyBoardResult,
    window,
    resetAt: window === 'weekly' && !weekStart ? '2026-11-29T19:00:00.000Z' : null,
    weekStart: window === 'weekly' ? (weekStart ?? '2026-11-23') : null,
    availableWeeks: window === 'weekly' ? ['2026-11-23', '2026-11-16'] : [],
  })),
  speciesBoard: vi.fn(async () => allBoardResult),
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

  it('기간 지원 보드(fame, sellGold, namedClears)는 window 생략 시 weekly로 조회하고 all 요청도 전달한다', async () => {
    for (const [board, fn] of [
      ['fame', readers.fameBoard],
      ['sellGold', readers.sellGoldBoard],
      ['namedClears', readers.namedClearsBoard],
    ] as const) {
      const def = await callRank({ board });
      expect(def.status).toBe(200);
      expect(def.body).toEqual({
        board,
        ...weeklyBoardResult,
        availableWeeks: ['2026-11-23', '2026-11-16'],
      });
      expect(fn).toHaveBeenLastCalledWith('DB', null, 'weekly', expect.any(String), undefined);
      expect(def.headers['cache-control']).toContain('s-maxage=60');

      const all = await callRank({ board, window: 'all' });
      expect(all.status).toBe(200);
      expect(all.body).toEqual({
        board,
        top: [],
        me: null,
        window: 'all',
        periodSupported: true,
        resetAt: null,
        weekStart: null,
        availableWeeks: [],
      });
      expect(fn).toHaveBeenLastCalledWith('DB', null, 'all', expect.any(String), undefined);
    }
  });

  it('week 쿼리가 유효한 과거 월요일이면 전달하고, 형식 오류·비월요일·미래 주차는 400 bad-week로 거부한다', async () => {
    const ok = await callRank({ board: 'sellGold', week: '2026-11-16' });
    expect(ok.status).toBe(200);
    expect(readers.sellGoldBoard).toHaveBeenLastCalledWith('DB', null, 'weekly', expect.any(String), '2026-11-16');

    expect((await callRank({ board: 'fame', week: 'bad' })).status).toBe(400);
    expect((await callRank({ board: 'fame', week: '2026-11-17' })).status).toBe(400); // 화요일
    expect((await callRank({ board: 'fame', week: '2099-01-05' })).status).toBe(400); // 미래 월요일
  });

  it('비기간 보드(dex, variant, named)는 window=weekly가 와도 누적 전용(all)으로 정규화한다', async () => {
    const cases = [
      ['dex', readers.dexBoard],
      ['variant', readers.variantBoard],
      ['named', readers.namedBoard],
    ] as const;
    for (const [board, fn] of cases) {
      const res = await callRank({ board, window: 'weekly' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ board, ...allBoardResult });
      expect(fn).toHaveBeenCalledWith('DB', null);
      expect(res.headers['cache-control']).toContain('s-maxage=60');
    }
  });

  it('로그인 세션이 있으면 uid를 전달하고 캐시하지 않는다', async () => {
    state.session = { id: 'u1', email: 'a@example.test' };
    const res = await callRank({ board: 'namedClears' });
    expect(res.status).toBe(200);
    expect(readers.namedClearsBoard).toHaveBeenCalledWith('DB', 'u1', 'weekly', expect.any(String), undefined);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('species 보드는 유효한 어종만 받고 window=weekly 요청에도 누적 전용으로 응답한다', async () => {
    expect((await callRank({ board: 'species' })).status).toBe(400);
    expect((await callRank({ board: 'species', fish: 'unknown' })).status).toBe(400);
    const res = await callRank({ board: 'species', fish: 'crucian', window: 'weekly' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ board: 'species', fishId: 'crucian', ...allBoardResult });
    expect(readers.speciesBoard).toHaveBeenCalledWith('DB', 'crucian', null);
  });

  it('메서드, 보드 이름, window, DB 환경 변수 오류를 거부한다', async () => {
    expect((await callRank({ board: 'fame' }, 'POST')).status).toBe(405);
    expect((await callRank({ board: 'invalid' })).status).toBe(400);
    expect((await callRank({ board: 'fame', window: 'monthly' })).status).toBe(400);
    delete process.env.DATABASE_URL;
    expect((await callRank({ board: 'fame' })).status).toBe(500);
  });
});
