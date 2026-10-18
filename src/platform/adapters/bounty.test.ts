// 수배 스냅샷 읽기 — 세션이 서기 전에 읽지 않고, 실패를 빈 값(null)으로 숨기지 않는다.
// 하루의 경계는 서버와 같은 게임 날짜(KST 04:00)이고, 만료된 의뢰는 스냅샷에 담지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown[] | null; error: { message: string } | null };
const state = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  results: {} as Record<string, Result>,
  queried: [] as string[],
  filtered: [] as [string, string, string][],
}));

vi.mock('./auth', () => {
  const query = (table: string) => {
    state.queried.push(table);
    const r = state.results[table] ?? { data: [], error: null };
    const p = Promise.resolve(r);
    return Object.assign(p, {
      gte: (column: string, value: string) => { state.filtered.push([table, column, value]); return p; },
    });
  };
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: state.session } }) },
      from: (table: string) => ({ select: () => query(table) }),
    },
  };
});

import { gameDay, readBounty } from './bounty';

// 2026-10-19 12:00 KST — 그날의 시작은 04:00 KST = 2026-10-18T19:00:00Z
const NOW = '2026-10-19T03:00:00.000Z';
const DAY_START = '2026-10-18T19:00:00.000Z';
const BEFORE = '2026-10-18T18:59:59.999+00:00'; // 03:59:59.999 KST — 전날
const TODAY = '2026-10-19T01:00:00+00:00';

describe('readBounty', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
    state.session = { user: { id: 'u1' } };
    state.results = {};
    state.queried = [];
    state.filtered = [];
  });
  afterEach(() => vi.useRealTimers());

  it('세션이 없으면 표를 읽지 않고 unauthorized로 실패한다 — 익명 권한의 빈 결과를 진실로 삼지 않는다', async () => {
    state.session = null;
    await expect(readBounty()).rejects.toMatchObject({ name: 'AppError', kind: 'unauthorized' });
    expect(state.queried).toEqual([]);
  });

  it('표 하나라도 실패하면 null이 아니라 오류로 실패한다 — 조회가 다시 시도할 수 있게', async () => {
    state.results.bounty_tickets = { data: null, error: { message: 'JWT expired' } };
    await expect(readBounty()).rejects.toMatchObject({ name: 'AppError', kind: 'network' });
  });

  it('클리어 기록은 게임 날짜의 시작(KST 04:00) 이후만 읽고 갈래별로 센다', async () => {
    state.results.bounty_clears = {
      data: [
        { kind: 'general', cleared_at: TODAY },
        { kind: 'named', cleared_at: TODAY },
        { kind: 'general', cleared_at: BEFORE }, // 서버 필터가 걸러 주지만 한 번 더 본다
      ],
      error: null,
    };
    const snap = await readBounty();
    expect(state.filtered).toContainEqual(['bounty_clears', 'cleared_at', DAY_START]);
    expect(snap?.clearsToday).toEqual({ general: 1, named: 1 });
  });

  it('수주 기록(bounty_accepts)은 읽지 않는다 — 한도는 클리어가 센다', async () => {
    await readBounty();
    expect(state.queried).not.toContain('bounty_accepts');
    expect(state.queried).toContain('bounty_clears');
  });

  it('경계 이전에 수주하고 마치지 못한 의뢰는 진행도와 도전권에서 빠진다', async () => {
    state.results.bounty_progress = {
      data: [
        { quest_id: 'pacific-easy-common', progress: 249, started_at: BEFORE },
        { quest_id: 'pacific-named-megalodon', progress: 0, started_at: BEFORE },
        { quest_id: 'seasia-named-leviathan', progress: 0, started_at: TODAY },
      ],
      error: null,
    };
    state.results.bounty_tickets = {
      data: [
        { quest_id: 'pacific-named-megalodon', issued_at: '2026-10-18T18:30:00+00:00' },
        { quest_id: 'seasia-named-leviathan', issued_at: TODAY },
      ],
      error: null,
    };
    const snap = await readBounty();
    expect(snap?.progress).toEqual([{ questId: 'seasia-named-leviathan', progress: 0 }]);
    expect(snap?.tickets).toEqual([{ questId: 'seasia-named-leviathan', issuedAt: TODAY }]);
  });

  it('경계 이전에 수주했어도 마친 의뢰는 남는다 — 보상을 받을 수 있다', async () => {
    state.results.bounty_progress = {
      data: [{ quest_id: 'pacific-easy-common', progress: 250, started_at: BEFORE }],
      error: null,
    };
    expect((await readBounty())?.progress).toEqual([{ questId: 'pacific-easy-common', progress: 250 }]);
  });
});

describe('gameDay', () => {
  afterEach(() => vi.useRealTimers());

  it('KST 04:00 경계의 날짜다 — 서버가 일일 의뢰를 정하는 날짜와 같다', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-18T18:59:59.000Z') }); // 03:59:59 KST
    expect(gameDay()).toBe('2026-10-18');
    vi.setSystemTime(new Date('2026-10-18T19:00:00.000Z')); // 04:00 KST
    expect(gameDay()).toBe('2026-10-19');
  });
});
