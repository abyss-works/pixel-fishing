// 랭킹 읽기 함수 — 실제 Postgres에서 순위 규칙(정렬·동순위·제외·내 순위)을 검사한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedUser, startActionEnv, testUid, sessionHeaders, userToken } from './_dbTest/actionHarness.js';
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
  await handler({ method, query, headers: sessionHeaders(token) } as never, res as never);
  return out;
}

const dex = (n: number, at = '2026-01-01T00:00:00Z') => Object.fromEntries(
  ['crucian', 'minnow', 'loach', 'carp', 'goldfish'].slice(0, n).map(id => [id, { normal: { count: 1, maxSize: 10, first: at } }]));

describe('랭킹 읽기 함수', () => {
  // 명성: A 300(먼저 도달), B 300, C 100, D 0(제외), E 500 제재(제외)
  let a: string, b: string, c: string;
  beforeAll(async () => {
    a = await seedUser(env.client, { uid: testUid(101), email: 'r101@example.test', nickname: '가', state: { fame: 300, dex: dex(2, '2026-01-02T00:00:00Z') }, updatedAt: '2026-01-01T00:00:00.000Z' });
    b = await seedUser(env.client, { uid: testUid(102), email: 'r102@example.test', nickname: '나', state: { fame: 300, dex: dex(5) }, updatedAt: '2026-01-05T00:00:00.000Z' });
    c = await seedUser(env.client, { uid: testUid(103), email: 'r103@example.test', nickname: '다', state: { fame: 100, dex: dex(2, '2026-01-01T00:00:00Z') } });
    await seedUser(env.client, { uid: testUid(104), email: 'r104@example.test', nickname: '라', state: { fame: 0 } });
    await seedUser(env.client, { uid: testUid(105), email: 'r105@example.test', nickname: '마', state: { fame: 500, dex: dex(5) }, restricted: true });
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

  it('세션이 없는 토큰이면 공개 순위만 준다', async () => {
    const res = await callRank({ board: 'fame' }, 'no-such-session');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ me: null });
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

describe('확장 순위 표 (일반·돌연변이·네임드 도감·네임드 토벌)', () => {
  type RankBody = { board: string; top: { rank: number; nickname: string | null; value: number; me: boolean }[]; me: { rank: number; value: number } | null };
  let u1: string, u2: string, u3: string, guest: string, zero: string;

  beforeAll(async () => {
    u1 = await seedUser(env.client, {
      uid: testUid(201), email: 'r201@example.test', nickname: '라일',
      state: {
        fame: 0,
        dex: {
          crucian: { normal: { count: 1, maxSize: 10, first: '2026-02-01T00:00:00Z' } },
          megalodon: { normal: { count: 1, maxSize: 10, first: '2026-02-01T00:00:00Z' } },
          leviathan: { normal: { count: 1, maxSize: 10, first: '2026-02-03T00:00:00Z' } },
          carp: { variant: { count: 1, maxSize: 10, first: '2026-02-02T00:00:00Z' } },
          goldfish: { variant: { count: 1, maxSize: 10, first: '2026-02-05T00:00:00Z' } },
        },
      },
    });
    u2 = await seedUser(env.client, {
      uid: testUid(202), email: 'r202@example.test', nickname: '마루',
      state: {
        fame: 0,
        dex: {
          megalodon: { normal: { count: 1, maxSize: 10, first: '2026-02-01T00:00:00Z' } },
          leviathan: { normal: { count: 1, maxSize: 10, first: '2026-02-02T00:00:00Z' } },
          crucian: { variant: { count: 1, maxSize: 10, first: '2026-02-01T00:00:00Z' } },
          minnow: { variant: { count: 1, maxSize: 10, first: '2026-02-03T00:00:00Z' } },
          loach: { variant: { count: 0, maxSize: null, first: '2026-02-01T00:00:00Z' } },
        },
      },
    });
    u3 = await seedUser(env.client, {
      uid: testUid(203), email: 'r203@example.test', nickname: '바다',
      state: {
        fame: 0,
        dex: {
          ananta: { normal: { count: 1, maxSize: 10, first: '2026-02-04T00:00:00Z' } },
          megalodon: { variant: { count: 1, maxSize: 10, first: '2026-02-01T00:00:00Z' } },
        },
      },
    });
    guest = await seedUser(env.client, {
      uid: testUid(204), email: null, nickname: '게스트',
      state: {
        fame: 999,
        dex: {
          crucian: { normal: { count: 1, maxSize: 10, first: '2026-01-01T00:00:00Z' }, variant: { count: 1, maxSize: 10, first: '2026-01-01T00:00:00Z' } },
          megalodon: { normal: { count: 1, maxSize: 10, first: '2026-01-01T00:00:00Z' } },
        },
      },
    });
    const restricted = await seedUser(env.client, {
      uid: testUid(205), email: 'r205@example.test', nickname: '제재2', restricted: true,
      state: {
        fame: 999,
        dex: {
          crucian: { normal: { count: 1, maxSize: 10, first: '2026-01-01T00:00:00Z' }, variant: { count: 1, maxSize: 10, first: '2026-01-01T00:00:00Z' } },
          megalodon: { normal: { count: 1, maxSize: 10, first: '2026-01-01T00:00:00Z' } },
        },
      },
    });
    zero = await seedUser(env.client, { uid: testUid(206), email: 'r206@example.test', nickname: '빈계정', state: { fame: 0 } });

    for (const [uid, kind, questId, clearedAt] of [
      [u1, 'named', 'pacific-named-megalodon', '2026-02-05T00:00:00Z'],
      [u1, 'named', 'seasia-named-leviathan', '2026-02-06T00:00:00Z'],
      [u1, 'general', 'pacific-easy-common', '2026-02-07T00:00:00Z'],
      [u2, 'named', 'pacific-named-megalodon', '2026-02-01T00:00:00Z'],
      [u2, 'named', 'pacific-named-megalodon', '2026-02-04T00:00:00Z'],
      [u3, 'named', 'indian-named-ananta', '2026-02-02T00:00:00Z'],
      [guest, 'named', 'pacific-named-megalodon', '2026-01-01T00:00:00Z'],
      [guest, 'named', 'seasia-named-leviathan', '2026-01-02T00:00:00Z'],
      [guest, 'named', 'indian-named-ananta', '2026-01-03T00:00:00Z'],
      [restricted, 'named', 'pacific-named-megalodon', '2026-01-01T00:00:00Z'],
      [restricted, 'named', 'seasia-named-leviathan', '2026-01-02T00:00:00Z'],
      [restricted, 'named', 'indian-named-ananta', '2026-01-03T00:00:00Z'],
      [zero, 'general', 'pacific-easy-common', '2026-02-01T00:00:00Z'],
    ] as const) {
      await env.client.query(
        'insert into public.bounty_clears (user_id, kind, quest_id, cleared_at) values ($1, $2, $3, $4)',
        [uid, kind, questId, clearedAt],
      );
    }
  });

  it('일반 도감은 네임드 어종·게스트·제재·0건을 제외한다', async () => {
    const resU1 = await callRank({ board: 'dex' }, userToken(u1));
    expect(resU1.status).toBe(200);
    const bodyU1 = resU1.body as RankBody;
    expect(bodyU1.me).toEqual({ rank: 4, value: 1 });
    expect(bodyU1.top.map(r => r.nickname)).toEqual(['나', '다', '가', '라일']);

    const resU2 = await callRank({ board: 'dex' }, userToken(u2));
    expect((resU2.body as RankBody).me).toBeNull();
  });

  it('돌연변이 도감은 일반 어종 돌연변이 폼만 세고 동점 시 먼저 도달한 사람이 위다', async () => {
    const pub = await callRank({ board: 'variant' });
    expect(pub.status).toBe(200);
    expect(pub.headers['cache-control']).toContain('s-maxage=60');
    expect(pub.body).toEqual({
      board: 'variant',
      top: [
        { rank: 1, nickname: '마루', value: 2, me: false },
        { rank: 1, nickname: '라일', value: 2, me: false },
      ],
      me: null,
    });

    expect(((await callRank({ board: 'variant' }, userToken(u1))).body as RankBody).me).toEqual({ rank: 1, value: 2 });
    expect(((await callRank({ board: 'variant' }, userToken(u3))).body as RankBody).me).toBeNull();
  });

  it('네임드 도감은 네임드 어종만 세고 동점 시 먼저 도달한 사람이 위다', async () => {
    const res = await callRank({ board: 'named' }, userToken(u1));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.body).toEqual({
      board: 'named',
      top: [
        { rank: 1, nickname: '마루', value: 2, me: false },
        { rank: 1, nickname: '라일', value: 2, me: true },
        { rank: 3, nickname: '바다', value: 1, me: false },
      ],
      me: { rank: 1, value: 2 },
    });
  });

  it('네임드 토벌 누적은 named만 세고 같은 유저의 중복 토벌을 합산하며 동점 시 마지막 토벌 시각이 이른 사람이 위다', async () => {
    const res = await callRank({ board: 'namedClears' }, userToken(u2));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      board: 'namedClears',
      top: [
        { rank: 1, nickname: '마루', value: 2, me: true },
        { rank: 1, nickname: '라일', value: 2, me: false },
        { rank: 3, nickname: '바다', value: 1, me: false },
      ],
      me: { rank: 1, value: 2 },
    });
    expect(((await callRank({ board: 'namedClears' }, userToken(zero))).body as RankBody).me).toBeNull();
  });

  it('게스트는 모든 순위 표에서 제외되고 본인 순위(me)도 비어 있다', async () => {
    for (const board of ['fame', 'dex', 'variant', 'named', 'namedClears'] as const) {
      const res = await callRank({ board }, userToken(guest));
      expect(res.status).toBe(200);
      const body = res.body as RankBody;
      expect(body.me).toBeNull();
      expect(body.top.some(r => r.nickname === '게스트' || r.me)).toBe(false);
    }
  });
});
