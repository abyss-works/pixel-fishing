// 랭킹 읽기 함수 — 실제 Postgres에서 순위 규칙(정렬·동순위·제외·내 순위)을 검사한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedUser, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';

let env: ActionEnv;

beforeAll(async () => {
  env = await startActionEnv();
});
afterAll(async () => {
  await env?.stop();
});

async function callRank(query: Record<string, string>, token: string | null = null, method = 'GET') {
  const { default: handler } = await import('./rank.js');
  const out: { status: number; body: unknown; headers: Record<string, string> } = { status: 0, body: undefined, headers: {} };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
  };
  await handler({ method, query, headers: token ? { authorization: `Bearer ${token}` } : {} } as never, res as never);
  return out;
}

const dex = (n: number, at = '2026-01-01T00:00:00Z') => Object.fromEntries(
  ['crucian', 'minnow', 'loach', 'carp', 'goldfish'].slice(0, n).map(id => [id, { normal: { count: 1, maxSize: 10, first: at } }]));

describe('랭킹 읽기 함수', () => {
  // 명성: A 300(먼저 도달), B 300, C 100, D 0(제외), E 500 제재(제외)
  let a: string, b: string, c: string;
  beforeAll(async () => {
    a = await seedUser(env.client, { uid: testUid(101), nickname: '가', state: { fame: 300, dex: dex(2, '2026-01-02T00:00:00Z') }, updatedAt: '2026-01-01T00:00:00.000Z' });
    b = await seedUser(env.client, { uid: testUid(102), nickname: '나', state: { fame: 300, dex: dex(5) }, updatedAt: '2026-01-05T00:00:00.000Z' });
    c = await seedUser(env.client, { uid: testUid(103), nickname: '다', state: { fame: 100, dex: dex(2, '2026-01-01T00:00:00Z') } });
    await seedUser(env.client, { uid: testUid(104), nickname: '라', state: { fame: 0 } });
    await seedUser(env.client, { uid: testUid(105), nickname: '마', state: { fame: 500, dex: dex(5) }, restricted: true });
    await env.client.query(`update public.records set max_size = 50 where user_id = $1 and fish_id = 'carp'`, [b]);
    await env.client.query(`update public.records set max_size = 50 where user_id = $1 and fish_id = 'crucian'`, [a]);
    await env.client.query(`update public.records set max_size = 40 where user_id = $1 and fish_id = 'crucian'`, [c]);
    await env.client.query(`update public.records set max_size = 999 where user_id = $1`, [testUid(105)]);
  });

  it('GET 외 메서드는 405, 모르는 표는 400이다', async () => {
    expect((await callRank({ board: 'fame' }, null, 'POST')).status).toBe(405);
    expect((await callRank({ board: 'nope' })).status).toBe(400);
  });

  it('명성 순위: 같은 값은 같은 순위이고 먼저 도달한 사람이 위다. 0과 제재 계정은 빠진다', async () => {
    const res = await callRank({ board: 'fame' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      board: 'fame',
      top: [
        { rank: 1, nickname: '가', value: 300, me: false },
        { rank: 1, nickname: '나', value: 300, me: false },
        { rank: 3, nickname: '다', value: 100, me: false },
      ],
      me: null,
    });
    expect(res.headers['cache-control']).toContain('s-maxage=60');
  });

  it('토큰이 있으면 내 순위와 내 행 표시를 함께 주고 캐시하지 않는다', async () => {
    const res = await callRank({ board: 'fame' }, userToken(c));
    expect(res.body).toMatchObject({ me: { rank: 3, value: 100 } });
    expect((res.body as { top: { me: boolean }[] }).top.map(r => r.me)).toEqual([false, false, true]);
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('잘못된 토큰은 401이다', async () => {
    expect((await callRank({ board: 'fame' }, 'bad.token.here')).status).toBe(401);
  });

  it('도감 완성도 순위: 일반 폼 발견 어종 수, 같은 수면 마지막 새 어종을 먼저 낚은 사람이 위다', async () => {
    const res = await callRank({ board: 'dex' }, userToken(a));
    expect(res.body).toEqual({
      board: 'dex',
      top: [
        { rank: 1, nickname: '나', value: 5, me: false },
        { rank: 2, nickname: '다', value: 2, me: false },
        { rank: 2, nickname: '가', value: 2, me: true },
      ],
      me: { rank: 2, value: 2 },
    });
  });

  it('어종 순위: 그 어종의 사람별 가장 큰 크기 순. 어종이 없거나 모르면 400, 제재 계정은 빠진다', async () => {
    expect((await callRank({ board: 'species' })).status).toBe(400);
    expect((await callRank({ board: 'species', fish: 'no-such-fish' })).status).toBe(400);
    const res = await callRank({ board: 'species', fish: 'crucian' }, userToken(c));
    expect(res.body).toEqual({
      board: 'species',
      fishId: 'crucian',
      top: [
        { rank: 1, nickname: '가', value: 50, me: false },
        { rank: 2, nickname: '다', value: 40, me: true },
        { rank: 3, nickname: '나', value: 10, me: false },
      ],
      me: { rank: 2, value: 40 },
    });
  });
});
