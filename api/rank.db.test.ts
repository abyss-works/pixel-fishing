// 랭킹 읽기 함수 — 실제 Postgres에서 순위 규칙(주간/누적·정렬·동순위·제외·내 순위)을 검사한다.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { gameWeekStartDay, gameWeekStartISO, nextGameWeekResetISO } from '../src/game/rules/time.js';
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

  it('GET 외 메서드는 405, 모르는 표나 window는 400이다', async () => {
    expect((await callRank({ board: 'fame' }, null, 'POST')).status).toBe(405);
    expect((await callRank({ board: 'nope' })).status).toBe(400);
    expect((await callRank({ board: 'fame', window: 'monthly' })).status).toBe(400);
  });

  it('누적 명성 순위(window=all): 같은 값은 같은 순위이고 먼저 도달한 사람이 위다. 0과 제재 계정은 빠진다', async () => {
    const res = await callRank({ board: 'fame', window: 'all' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      board: 'fame',
      window: 'all',
      periodSupported: true,
      resetAt: null,
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
    const res = await callRank({ board: 'fame', window: 'all' }, userToken(c));
    expect(res.body).toMatchObject({ me: { rank: 3, value: 100 } });
    expect((res.body as { top: { me: boolean }[] }).top.map(r => r.me)).toEqual([false, false, true]);
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('세션이 없는 토큰이면 공개 순위만 준다', async () => {
    const res = await callRank({ board: 'fame', window: 'all' }, 'no-such-session');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ me: null });
  });

  it('도감 완성도 순위: window=weekly가 와도 누적 전용(all)으로 응답하고, 마지막 새 어종을 먼저 낚은 사람이 위다', async () => {
    const res = await callRank({ board: 'dex', window: 'weekly' }, userToken(a));
    expect(res.body).toEqual({
      board: 'dex',
      window: 'all',
      periodSupported: false,
      resetAt: null,
      top: [
        { rank: 1, nickname: '나', value: 5, me: false },
        { rank: 2, nickname: '다', value: 2, me: false },
        { rank: 2, nickname: '가', value: 2, me: true },
      ],
      me: { rank: 2, value: 2 },
    });
  });

  it('어종 순위: 그 어종의 사람별 가장 큰 크기 순. window=weekly여도 누적 전용(all)이며 어종 오류는 400이다', async () => {
    expect((await callRank({ board: 'species' })).status).toBe(400);
    expect((await callRank({ board: 'species', fish: 'no-such-fish' })).status).toBe(400);
    const res = await callRank({ board: 'species', fish: 'crucian', window: 'weekly' }, userToken(c));
    expect(res.body).toEqual({
      board: 'species',
      fishId: 'crucian',
      window: 'all',
      periodSupported: false,
      resetAt: null,
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
  type RankBody = {
    board: string;
    window: string;
    periodSupported: boolean;
    resetAt: string | null;
    top: { rank: number; nickname: string | null; value: number; me: boolean }[];
    me: { rank: number; value: number } | null;
  };
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
    expect(bodyU1.window).toBe('all');
    expect(bodyU1.periodSupported).toBe(false);
    expect(bodyU1.resetAt).toBeNull();

    const resU2 = await callRank({ board: 'dex' }, userToken(u2));
    expect((resU2.body as RankBody).me).toBeNull();
  });

  it('돌연변이 도감은 일반 어종 돌연변이 폼만 세고 동점 시 먼저 도달한 사람이 위다', async () => {
    const pub = await callRank({ board: 'variant', window: 'weekly' });
    expect(pub.status).toBe(200);
    expect(pub.headers['cache-control']).toContain('s-maxage=60');
    expect(pub.body).toEqual({
      board: 'variant',
      window: 'all',
      periodSupported: false,
      resetAt: null,
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
      window: 'all',
      periodSupported: false,
      resetAt: null,
      top: [
        { rank: 1, nickname: '마루', value: 2, me: false },
        { rank: 1, nickname: '라일', value: 2, me: true },
        { rank: 3, nickname: '바다', value: 1, me: false },
      ],
      me: { rank: 1, value: 2 },
    });
  });

  it('네임드 토벌 누적(window=all)은 named만 세고 같은 유저의 중복 토벌을 합산하며 동점 시 마지막 토벌 시각이 이른 사람이 위다', async () => {
    const res = await callRank({ board: 'namedClears', window: 'all' }, userToken(u2));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      board: 'namedClears',
      window: 'all',
      periodSupported: true,
      resetAt: null,
      top: [
        { rank: 1, nickname: '마루', value: 2, me: true },
        { rank: 1, nickname: '라일', value: 2, me: false },
        { rank: 3, nickname: '바다', value: 1, me: false },
      ],
      me: { rank: 1, value: 2 },
    });
    expect(((await callRank({ board: 'namedClears', window: 'all' }, userToken(zero))).body as RankBody).me).toBeNull();
  });

  it('게스트는 모든 순위 표에서 제외되고 본인 순위(me)도 비어 있다', async () => {
    for (const query of [
      { board: 'fame' },
      { board: 'fame', window: 'all' },
      { board: 'dex' },
      { board: 'variant' },
      { board: 'named' },
      { board: 'namedClears' },
      { board: 'namedClears', window: 'all' },
    ] as Record<string, string>[]) {
      const res = await callRank(query, userToken(guest));
      expect(res.status).toBe(200);
      const body = res.body as RankBody;
      expect(body.me).toBeNull();
      expect(body.top.some(r => r.nickname === '게스트' || r.me)).toBe(false);
    }
  });
});

describe('주간 랭킹과 기간 분기 (fame·namedClears)', () => {
  // 2030-03-11(월) KST 04:00 = 2030-03-10T19:00:00.000Z (이번 주 시작)
  // 다음 주 리셋 = 2030-03-17T19:00:00.000Z
  const WEEK_NOW = '2030-03-13T05:00:00.000Z';
  const WEEK_START_DAY = gameWeekStartDay(WEEK_NOW); // 2030-03-11
  const WEEK_START_ISO = gameWeekStartISO(WEEK_NOW); // 2030-03-10T19:00:00.000Z
  const PREV_WEEK_DAY = '2030-03-04';
  const NEXT_RESET = nextGameWeekResetISO(WEEK_NOW); // 2030-03-17T19:00:00.000Z

  let w1: string, w2: string, w3: string, wZero: string, wGuest: string, wRestricted: string;
  const extraUids: string[] = [];

  beforeAll(async () => {
    w1 = await seedUser(env.client, { uid: testUid(301), email: 'w301@example.test', nickname: '주간하나', state: { fame: 5000 } });
    w2 = await seedUser(env.client, { uid: testUid(302), email: 'w302@example.test', nickname: '주간둘', state: { fame: 2000 } });
    w3 = await seedUser(env.client, { uid: testUid(303), email: 'w303@example.test', nickname: '주간셋', state: { fame: 9000 } });
    wZero = await seedUser(env.client, { uid: testUid(304), email: 'w304@example.test', nickname: '주간영', state: { fame: 4000 } });
    wGuest = await seedUser(env.client, { uid: testUid(305), email: null, nickname: '주간게스트', state: { fame: 9999 } });
    wRestricted = await seedUser(env.client, { uid: testUid(306), email: 'w306@example.test', nickname: '주간제재', state: { fame: 9999 }, restricted: true });

    // 이번 주 주간 명성: w2(200, 먼저 도달) == w1(200, 나중 도달) > w3(100), wZero(0 제외), wGuest/wRestricted 제외, 지난 주(w3 800) 제외
    for (const [weekStart, uid, fameGained, reachedAt] of [
      [WEEK_START_DAY, w1, 200, '2030-03-12T01:00:00.000Z'],
      [WEEK_START_DAY, w2, 200, '2030-03-11T01:00:00.000Z'],
      [WEEK_START_DAY, w3, 100, '2030-03-11T02:00:00.000Z'],
      [WEEK_START_DAY, wZero, 0, '2030-03-11T00:00:00.000Z'],
      [WEEK_START_DAY, wGuest, 999, '2030-03-11T00:00:00.000Z'],
      [WEEK_START_DAY, wRestricted, 999, '2030-03-11T00:00:00.000Z'],
      [PREV_WEEK_DAY, w3, 800, '2030-03-05T00:00:00.000Z'],
    ] as const) {
      await env.client.query(
        `insert into public.ranking_weekly_fame (week_start, user_id, fame_gained, reached_at, updated_at)
         values ($1::date, $2, $3, $4::timestamptz, $4::timestamptz)`,
        [weekStart, uid, fameGained, reachedAt],
      );
    }

    // 이번 주 네임드 토벌:
    // - w3 지난주 경계 1ms 전(제외) + 이번주 1건
    // - w1 경계 정각(포함) + 이번주 1건 => 2건 (마지막 2030-03-11T03:00:00Z)
    // - w2 이번주 2건 (마지막 2030-03-11T01:00:00Z, w1보다 빠름)
    // - wGuest, wRestricted 이번주 각 3건(제외)
    const beforeBoundary = new Date(Date.parse(WEEK_START_ISO) - 1).toISOString();
    for (const [uid, kind, questId, clearedAt] of [
      [w3, 'named', 'pacific-named-megalodon', beforeBoundary],
      [w3, 'named', 'seasia-named-leviathan', '2030-03-11T05:00:00.000Z'],
      [w1, 'named', 'pacific-named-megalodon', WEEK_START_ISO],
      [w1, 'named', 'seasia-named-leviathan', '2030-03-11T03:00:00.000Z'],
      [w1, 'general', 'pacific-easy-common', '2030-03-11T04:00:00.000Z'],
      [w2, 'named', 'pacific-named-megalodon', '2030-03-11T00:30:00.000Z'],
      [w2, 'named', 'indian-named-ananta', '2030-03-11T01:00:00.000Z'],
      [wGuest, 'named', 'pacific-named-megalodon', '2030-03-11T00:00:00.000Z'],
      [wRestricted, 'named', 'pacific-named-megalodon', '2030-03-11T00:00:00.000Z'],
    ] as const) {
      await env.client.query(
        'insert into public.bounty_clears (user_id, kind, quest_id, cleared_at) values ($1, $2, $3, $4)',
        [uid, kind, questId, clearedAt],
      );
    }

    // 상위 50명 밖 내 순위(me) 검증을 위한 51명 추가 시딩 (주간 명성 150~101 등)
    for (let i = 0; i < 51; i++) {
      const uid = await seedUser(env.client, {
        uid: testUid(400 + i),
        email: `w400-${i}@example.test`,
        nickname: `러너${i}`,
        state: { fame: 10 },
      });
      extraUids.push(uid);
      await env.client.query(
        `insert into public.ranking_weekly_fame (week_start, user_id, fame_gained, reached_at, updated_at)
         values ($1::date, $2, $3, $4::timestamptz, $4::timestamptz)`,
        [WEEK_START_DAY, uid, 150 + i, '2030-03-12T10:00:00.000Z'],
      );
    }
  });

  it('명성 기본 조회는 주간(weekly)이며 지난주·0점·게스트·제재를 빼고 상위 50 밖 내 순위도 반환한다', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(WEEK_NOW) });
    try {
      // w3(100)은 w1(200), w2(200), extra 51명(200..150) 아래 54위
      const res = await callRank({ board: 'fame' }, userToken(w3));
      expect(res.status).toBe(200);
      const body = res.body as {
        board: string;
        window: string;
        periodSupported: boolean;
        resetAt: string | null;
        top: { rank: number; nickname: string | null; value: number; me: boolean }[];
        me: { rank: number; value: number } | null;
      };
      expect(body.board).toBe('fame');
      expect(body.window).toBe('weekly');
      expect(body.periodSupported).toBe(true);
      expect(body.resetAt).toBe(NEXT_RESET);
      expect(body.top).toHaveLength(50);
      expect(body.top.slice(0, 2)).toEqual([
        { rank: 1, nickname: '주간둘', value: 200, me: false },
        { rank: 1, nickname: '주간하나', value: 200, me: false },
      ]);
      expect(body.top.some(r => r.nickname === '주간셋' || r.nickname === '주간영' || r.nickname === '주간게스트' || r.nickname === '주간제재')).toBe(false);
      expect(body.me).toEqual({ rank: 54, value: 100 });

      // 상위 50 안의 w1 내 순위
      const resW1 = await callRank({ board: 'fame' }, userToken(w1));
      expect((resW1.body as typeof body).me).toEqual({ rank: 1, value: 200 });
      expect((resW1.body as typeof body).top[1].me).toBe(true);

      // wZero는 0점이라 me: null
      const resZero = await callRank({ board: 'fame' }, userToken(wZero));
      expect((resZero.body as typeof body).me).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('네임드 토벌 기본 조회는 주간(weekly)이며 월요일 KST 04:00 경계 전을 제외하고 정각 이후만 집계한다', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(WEEK_NOW) });
    try {
      const weekly = await callRank({ board: 'namedClears' }, userToken(w3));
      expect(weekly.status).toBe(200);
      expect(weekly.body).toEqual({
        board: 'namedClears',
        window: 'weekly',
        periodSupported: true,
        resetAt: NEXT_RESET,
        top: [
          { rank: 1, nickname: '주간둘', value: 2, me: false },
          { rank: 1, nickname: '주간하나', value: 2, me: false },
          { rank: 3, nickname: '주간셋', value: 1, me: true },
        ],
        me: { rank: 3, value: 1 },
      });

      // 누적(all)은 지난주 기록까지 포함해 w3이 2승이 된다
      const all = await callRank({ board: 'namedClears', window: 'all' }, userToken(w3));
      expect(all.status).toBe(200);
      const allBody = all.body as { window: string; periodSupported: boolean; resetAt: string | null; me: { rank: number; value: number } | null };
      expect(allBody.window).toBe('all');
      expect(allBody.periodSupported).toBe(true);
      expect(allBody.resetAt).toBeNull();
      expect(allBody.me?.value).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('다음 주로 넘어가면 주간 명성과 주간 네임드 토벌이 빈 순위로 초기화되고 누적(all)은 유지된다', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(NEXT_RESET) });
    try {
      const nextWeeklyFame = await callRank({ board: 'fame' }, userToken(w1));
      expect(nextWeeklyFame.body).toEqual({
        board: 'fame',
        window: 'weekly',
        periodSupported: true,
        resetAt: nextGameWeekResetISO(NEXT_RESET),
        top: [],
        me: null,
      });

      const nextWeeklyNamed = await callRank({ board: 'namedClears' }, userToken(w1));
      expect(nextWeeklyNamed.body).toEqual({
        board: 'namedClears',
        window: 'weekly',
        periodSupported: true,
        resetAt: nextGameWeekResetISO(NEXT_RESET),
        top: [],
        me: null,
      });

      const allFame = await callRank({ board: 'fame', window: 'all' }, userToken(w3));
      expect((allFame.body as { me: { rank: number; value: number } | null }).me).toMatchObject({ value: 9000 });
    } finally {
      vi.useRealTimers();
    }
  });
});
