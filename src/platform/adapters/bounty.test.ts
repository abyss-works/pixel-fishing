// 수배 스냅샷 읽기 — 세션이 서기 전에 읽지 않고, 실패를 빈 값(null)으로 숨기지 않는다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown[] | null; error: { message: string } | null };
const state = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  results: {} as Record<string, Result>,
  queried: [] as string[],
}));

vi.mock('./auth', () => {
  const query = (table: string) => {
    state.queried.push(table);
    const r = state.results[table] ?? { data: [], error: null };
    const p = Promise.resolve(r);
    return Object.assign(p, { gte: () => p });
  };
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: state.session } }) },
      from: (table: string) => ({ select: () => query(table) }),
    },
  };
});

import { readBounty } from './bounty';

describe('readBounty', () => {
  beforeEach(() => {
    state.session = { user: { id: 'u1' } };
    state.results = {};
    state.queried = [];
  });

  it('세션이 없으면 표를 읽지 않고 unauthorized로 실패한다 — 익명 권한의 빈 결과를 진실로 삼지 않는다', async () => {
    state.session = null;
    await expect(readBounty()).rejects.toMatchObject({ name: 'AppError', kind: 'unauthorized' });
    expect(state.queried).toEqual([]);
  });

  it('표 하나라도 실패하면 null이 아니라 오류로 실패한다 — 조회가 다시 시도할 수 있게', async () => {
    state.results.bounty_tickets = { data: null, error: { message: 'JWT expired' } };
    await expect(readBounty()).rejects.toMatchObject({ name: 'AppError', kind: 'network' });
  });

  it('성공하면 오늘 일반 수주와 네임드 수주를 나눠 센다', async () => {
    state.results.bounty_accepts = {
      data: [{ quest_id: 'nope-general' }, { quest_id: 'nope-general-2' }], error: null,
    };
    const snap = await readBounty();
    expect(snap?.acceptsToday).toBe(2);
    expect(snap?.namedToday).toBe(0);
  });
});
