// 방치 결과 보고 읽기 함수 — 실제 Postgres에서 기간·유형·사용자 거르기와 요약 응답을 검사한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedUser, sessionHeaders, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';
import { FISH, RARITY } from '../src/game/rules/logic.js';

let env: ActionEnv;

beforeAll(async () => {
  env = await startActionEnv();
});
afterAll(async () => {
  await env?.stop();
});

async function callAway(query: Record<string, string>, token: string | null, method = 'GET') {
  const { default: handler } = await import('./awayReport.js');
  const out: { status: number; body: unknown; headers: Record<string, string> } = { status: 0, body: undefined, headers: {} };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
  };
  await handler({ method, query, headers: sessionHeaders(token) } as never, res as never);
  return out;
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

async function event(uid: string, type: string, payload: unknown, createdAt: string) {
  await env.client.query('insert into public.events (user_id, type, payload, created_at) values ($1, $2, $3, $4)',
    [uid, type, payload, createdAt]);
}
const catchPayload = (fishId: string, over: Record<string, unknown> = {}) =>
  ({ uid: `c-${Math.random()}`, fishId, form: 'normal', size: 20, judgment: 'auto', spot: 'sea', isNew: false, ...over });

describe('방치 결과 보고 읽기 함수', () => {
  let me: string;
  beforeAll(async () => {
    me = await seedUser(env.client, { uid: testUid(201) });
    const other = await seedUser(env.client, { uid: testUid(202) });
    await event(me, 'catch', catchPayload('mackerel'), minutesAgo(50));
    await event(me, 'catch', catchPayload('seabream', { isNew: true, size: 41 }), minutesAgo(40));
    await event(me, 'autoRelease', { uids: ['r1'], reason: 'bag-full', fish: [{ uid: 'r1', fishId: 'mackerel', form: 'normal' }] }, minutesAgo(30));
    await event(me, 'sell', { gold: 100, count: 1, uids: ['x'] }, minutesAgo(20));            // 다른 유형은 빠진다
    await event(me, 'catch', catchPayload('mackerel'), minutesAgo(90));                       // 기간 밖
    await event(other, 'catch', catchPayload('mackerel'), minutesAgo(10));                    // 다른 사용자
  });

  it('GET 외 메서드는 405, 세션이 없으면 401이다', async () => {
    expect((await callAway({ awayMs: '60000' }, userToken(me), 'POST')).status).toBe(405);
    expect((await callAway({ awayMs: '60000' }, null)).status).toBe(401);
  });

  it('awayMs가 양의 정수가 아니면 400이다', async () => {
    for (const awayMs of ['', '0', '-1', 'abc', '1.5']) {
      expect((await callAway({ awayMs }, userToken(me))).status).toBe(400);
    }
    expect((await callAway({}, userToken(me))).status).toBe(400);
  });

  it('기간 안의 내 캐치와 자동 방생만 요약한다', async () => {
    const res = await callAway({ awayMs: String(60 * 60_000) }, userToken(me));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    const price = (id: string) => FISH.find(f => f.id === id)!.price;
    expect(res.body).toMatchObject({
      awayMs: 60 * 60_000,
      catches: 2,
      value: price('mackerel') + price('seabream'),
      fame: RARITY.common.fame + RARITY.rare.fame,
      newFish: [{ fishId: 'seabream', form: 'normal', rarity: 'rare', maxSize: 41 }],
      released: { count: 1, value: price('mackerel') },
      spot: 'sea',
    });
    const full = (res.body as { bagFullAfterMs: number }).bagFullAfterMs;
    expect(full).toBeGreaterThan(29 * 60_000);
    expect(full).toBeLessThan(31 * 60_000);
  });

  it('조회 기간은 7일에서 자른다', async () => {
    const res = await callAway({ awayMs: String(30 * 24 * 3_600_000) }, userToken(me));
    expect(res.body).toMatchObject({ awayMs: 7 * 24 * 3_600_000, catches: 3 });
  });
});
