// 수배 스냅샷 읽기 — 세션이 서기 전의 거절과 실패를 빈 값(null)으로 숨기지 않는다.
// 하루의 경계는 서버와 같은 게임 날짜(KST 04:00)이고, 만료된 의뢰는 스냅샷에 담지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Rows = { clears: unknown[]; progress: unknown[]; tickets: unknown[] };
const state = vi.hoisted(() => ({
  status: 200,
  rows: { clears: [], progress: [], tickets: [] } as Rows,
  urls: [] as string[],
}));

vi.mock('./auth', () => ({ isCloud: true }));

import { gameDay, readBounty } from './bounty';

// 2026-10-19 12:00 KST — 그날의 시작은 04:00 KST = 2026-10-18T19:00:00Z
const NOW = '2026-10-19T03:00:00.000Z';
const BEFORE = '2026-10-18T18:59:59.999+00:00'; // 03:59:59.999 KST — 전날
const TODAY = '2026-10-19T01:00:00+00:00';

describe('readBounty', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
    state.status = 200;
    state.rows = { clears: [], progress: [], tickets: [] };
    state.urls = [];
    vi.stubGlobal('fetch', async (url: string) => {
      state.urls.push(url);
      return new Response(JSON.stringify(state.status === 200 ? state.rows : { error: 'x' }), { status: state.status });
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('세션이 없어 서버가 거절하면 unauthorized로 실패한다 — 빈 결과를 진실로 삼지 않는다', async () => {
    state.status = 401;
    await expect(readBounty()).rejects.toMatchObject({ name: 'AppError', kind: 'unauthorized' });
  });

  it('서버 읽기가 실패하면 null이 아니라 오류로 실패한다 — 조회가 다시 시도할 수 있게', async () => {
    state.status = 500;
    await expect(readBounty()).rejects.toMatchObject({ name: 'AppError', kind: 'network' });
  });

  it('클리어 기록은 게임 날짜의 시작(KST 04:00) 이후만 갈래별로 센다', async () => {
    state.rows.clears = [
      { kind: 'general', cleared_at: TODAY },
      { kind: 'named', cleared_at: TODAY },
      { kind: 'general', cleared_at: BEFORE }, // 서버가 걸러 주지만 한 번 더 본다
    ];
    const snap = await readBounty();
    expect(state.urls).toEqual(['/api/me?q=bounty']);
    expect(snap?.clearsToday).toEqual({ general: 1, named: 1 });
  });

  it('경계 이전에 수주하고 마치지 못한 의뢰는 진행도와 도전권에서 빠진다', async () => {
    state.rows.progress = [
      { quest_id: 'pacific-easy-common', progress: 249, started_at: BEFORE },
      { quest_id: 'pacific-named-megalodon', progress: 0, started_at: BEFORE },
      { quest_id: 'seasia-named-leviathan', progress: 0, started_at: TODAY },
    ];
    state.rows.tickets = [
      { quest_id: 'pacific-named-megalodon', issued_at: '2026-10-18T18:30:00+00:00' },
      { quest_id: 'seasia-named-leviathan', issued_at: TODAY },
    ];
    const snap = await readBounty();
    expect(snap?.progress).toEqual([{ questId: 'seasia-named-leviathan', progress: 0 }]);
    expect(snap?.tickets).toEqual([{ questId: 'seasia-named-leviathan', issuedAt: TODAY }]);
  });

  it('경계 이전에 수주했어도 마친 의뢰는 남는다 — 보상을 받을 수 있다', async () => {
    state.rows.progress = [{ quest_id: 'pacific-easy-common', progress: 250, started_at: BEFORE }];
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
