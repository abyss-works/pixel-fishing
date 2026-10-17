// 네임드 결투 결과 확정 — 성공·실패 모두 도전권 행을 지우고, 성공만 진행도를 1 올린다.
// 리듀서가 티켓 유효·수주 활성·주장 정합성을 이미 검증한 뒤에 부르는 서버 쓰기 경로다.
import { describe, it, expect } from 'vitest';
import { applyChallengeResult } from './action.js';

type Row = Record<string, unknown>;
const NOW = '2026-10-17T00:00:00.000Z';
const Q = 'pacific-named-megalodon';

/** 테이블 두 개만 흉내 내는 최소 클라이언트 — select·update·delete + eq 사슬 */
function fakeAdmin(tables: Record<string, Row[]>, fail?: { table: string; op: string }) {
  return {
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
      const err = (op: string) => (fail?.table === table && fail.op === op ? { message: 'boom' } : null);
      const chain = (run: () => { data?: unknown; error: unknown }) => {
        const q = {
          eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
          maybeSingle: () => Promise.resolve(run()),
          then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
        };
        return q;
      };
      return {
        select: () => chain(() => ({ data: tables[table].find(match) ?? null, error: err('select') })),
        update: (values: Row) => chain(() => {
          const e = err('update');
          if (!e) tables[table].filter(match).forEach(r => Object.assign(r, values));
          return { error: e };
        }),
        delete: () => chain(() => {
          const e = err('delete');
          if (!e) tables[table] = tables[table].filter(r => !match(r));
          return { error: e };
        }),
      };
    },
  };
}

const seed = () => ({
  bounty_progress: [{ user_id: 'u1', quest_id: Q, progress: 0 }, { user_id: 'u2', quest_id: Q, progress: 0 }],
  bounty_tickets: [{ user_id: 'u1', quest_id: Q }, { user_id: 'u2', quest_id: Q }],
});

describe('applyChallengeResult', () => {
  it('성공하면 진행도를 1 올리고 도전권을 지운다 — 다른 유저 행은 건드리지 않는다', async () => {
    const t = seed();
    await applyChallengeResult(fakeAdmin(t) as never, 'u1', Q, true, NOW);
    expect(t.bounty_progress).toEqual([
      { user_id: 'u1', quest_id: Q, progress: 1, updated_at: NOW },
      { user_id: 'u2', quest_id: Q, progress: 0 },
    ]);
    expect(t.bounty_tickets).toEqual([{ user_id: 'u2', quest_id: Q }]);
  });

  it('실패해도 도전권은 지우고 진행도는 그대로다 — 놓치면 다시 조우해야 한다', async () => {
    const t = seed();
    await applyChallengeResult(fakeAdmin(t) as never, 'u1', Q, false, NOW);
    expect(t.bounty_progress[0]).toEqual({ user_id: 'u1', quest_id: Q, progress: 0 });
    expect(t.bounty_tickets).toEqual([{ user_id: 'u2', quest_id: Q }]);
  });

  it('없는 의뢰는 아무것도 쓰지 않는다', async () => {
    const t = seed();
    await applyChallengeResult(fakeAdmin(t) as never, 'u1', 'nope', true, NOW);
    expect(t).toEqual(seed());
  });

  it('쓰기 실패는 500 ApiError로 던진다', async () => {
    await expect(applyChallengeResult(fakeAdmin(seed(), { table: 'bounty_tickets', op: 'delete' }) as never, 'u1', Q, false, NOW))
      .rejects.toMatchObject({ status: 500, code: 'db-write' });
    await expect(applyChallengeResult(fakeAdmin(seed(), { table: 'bounty_progress', op: 'select' }) as never, 'u1', Q, true, NOW))
      .rejects.toMatchObject({ status: 500, code: 'db-read' });
  });
});
