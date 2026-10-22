// 관리자 읽기 함수를 실제 Postgres에서 검사한다. 관리자 판정(401·403)과 조회별 결과를 본다.
// 조회 결과는 관리자 뷰·함수의 결과와 같아야 한다. 같은 데이터를 authenticated 역할과 세션 클레임으로 읽은
// 뷰·함수 결과(PostgREST의 읽기 방식)를 기댓값으로 쓴다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedUser, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';

const ADMIN = testUid(901);  // 관리자 명부에 있는 사용자
const PLAYER = testUid(902); // 명부에 없는 일반 사용자
const GUEST = testUid(903);  // 제재된 익명 사용자
const IDLE_A = testUid(904); // 저장이 없는 익명 사용자
const IDLE_B = testUid(905);

type Row = Record<string, unknown>;
interface Out { status: number; body: unknown; headers: Record<string, string> }

let env: ActionEnv;

beforeAll(async () => {
  env = await startActionEnv();
  await seedUser(env.client, { uid: ADMIN, email: 'admin@example.test', nickname: '운영',
    state: { gold: 1200, fame: 80, boat: 1, rod: 4, location: { kind: 'region', id: 'world' }, visited: ['village', 'world'] },
    updatedAt: '2026-10-18T09:00:00.000Z' });
  await seedUser(env.client, { uid: PLAYER, email: 'player@example.test', nickname: '플레이어',
    state: { gold: 300, fame: 20, boat: 0, rod: 2, location: { kind: 'base', id: 'harbor' }, visited: ['village'] },
    updatedAt: '2026-10-18T10:00:00.000Z' });
  await seedUser(env.client, { uid: GUEST, nickname: null,
    state: { gold: 10, fame: 0, boat: 0, rod: 1 }, restricted: true, updatedAt: '2026-10-17T08:00:00.000Z' });
  await seedUser(env.client, { uid: IDLE_A, nickname: null });
  await seedUser(env.client, { uid: IDLE_B, nickname: null });
  await env.client.query(`update auth.users set created_at = '2026-10-01T00:00:00Z', last_sign_in_at = '2026-10-18T08:30:00Z'
    where id = $1`, [ADMIN]);
  await env.client.query(`update auth.users set created_at = '2026-10-05T12:00:00Z' where id = $1`, [PLAYER]);
  await env.client.query('insert into public.admins (user_id) values ($1)', [ADMIN]);
});
afterAll(async () => {
  await env?.stop();
});

async function callAdmin(query: Record<string, string>, token: string | null = null, method = 'GET', body?: unknown): Promise<Out> {
  const { default: handler } = await import('./admin.js');
  const out: Out = { status: 0, body: undefined, headers: {} };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
  };
  await handler({ method, query, body, headers: token ? { authorization: `Bearer ${token}` } : {} } as never, res as never);
  return out;
}

/**
 * PostgREST와 같은 방식으로 뷰·함수를 읽는다. authenticated 역할과 세션 클레임을 건다.
 * 테스트 이미지의 auth.uid()는 sub 설정값만 읽으므로 클레임 묶음과 sub 설정값을 모두 건다.
 */
async function asBrowser(uid: string, select: string): Promise<Row[]> {
  const { client } = env;
  await client.query('begin');
  try {
    await client.query('set local role authenticated');
    await client.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`,
      [JSON.stringify({ sub: uid, role: 'authenticated' }), uid]);
    const { rows } = await client.query(`select coalesce(json_agg(t), '[]'::json) as rows from (${select}) t`);
    return rows[0].rows as Row[];
  } finally {
    await client.query('rollback');
  }
}

/** DB 시계 기준 KST 오늘 날짜 */
async function kstToday(): Promise<string> {
  const { rows } = await env.client.query(`select ((now() at time zone 'Asia/Seoul')::date)::text as d`);
  return rows[0].d as string;
}

const sinceDay = (days: number) => `where day >= (now() at time zone 'Asia/Seoul')::date - ${days - 1}`;
const byKey = (rows: Row[], key: (r: Row) => string): Row[] => [...rows].sort((a, b) => key(a).localeCompare(key(b)));

interface Case {
  name: string;
  params?: Record<string, string>;
  /** 결과를 대조할 뷰·함수의 조회문 */
  view: string;
  /** 뷰가 순서를 정하지 않는 조회의 비교 키. 없으면 뷰의 순서까지 같아야 한다 */
  key?: (r: Row) => string;
  /** 함수 결과를 읽기 함수의 반환 순서로 맞춘다 */
  after?: (rows: Row[]) => Row[];
  /** 읽기 함수에만 있는 열을 뺀다 — 뷰가 만들어진 뒤 읽기 함수에 더한 열 */
  only?: (r: Row) => Row;
  /** 데이터가 있는 상태에서 비어 있지 않아야 하는가 */
  filled: boolean;
}

const byId = (r: Row) => String(r.id).padStart(12, '0');
/** 기간(days)을 받는 일 단위 조회. 뷰는 day 열로 거른다 */
const dayCase = (name: string, view: string, days: number): Case => ({
  name, params: { days: String(days) }, view: `select * from public.${view} ${sinceDay(days)}`,
  filled: days > 1 || name === 'dailyActive',
  // 우편 유입(mail_gold)은 v_economy_daily가 만들어진 뒤 더한 열이다. 나머지 열은 뷰와 같아야 한다
  ...(name === 'economy' ? { only: ({ mail_gold: _mail, ...rest }: Row) => rest } : {}),
});
const CASES: Case[] = [
  { name: 'users', view: 'select * from public.v_admin_users', key: r => String(r.user_id), filled: true },
  dayCase('dailyActive', 'v_daily_active', 30),
  { name: 'retention', view: 'select * from public.v_retention_cohorts', filled: true },
  dayCase('economy', 'v_economy_daily', 30),
  dayCase('bountyFunnel', 'v_bounty_funnel_daily', 7),
  dayCase('catchQuality', 'v_catch_quality', 90),
  { name: 'spamFlags', view: 'select * from public.v_spam_flags', key: r => String(r.user_id), filled: true },
  { name: 'imports', view: 'select * from public.v_import_log', key: byId, filled: true },
  { name: 'dexMismatch', view: 'select * from public.v_dex_mismatch', key: r => `${r.user_id}/${r.fish_id}/${r.form}`, filled: true },
  { name: 'recentEvents', view: 'select * from public.v_events_recent', filled: true },
  { name: 'userEvents', params: { user: PLAYER, limit: '300' }, view: `select * from public.fn_user_events('${PLAYER}', 300)`,
    after: rows => [...rows].sort((a, b) => Number(a.id) - Number(b.id)), filled: true },
  { name: 'letters', view: 'select * from public.v_admin_letters', filled: true },
];
/** 기간 하한의 경계: 하루, 일주일, 대시보드의 최대 기간 */
const DAY_CASES: Case[] = [1, 7, 90].flatMap(days => [
  dayCase('dailyActive', 'v_daily_active', days), dayCase('economy', 'v_economy_daily', days),
  dayCase('bountyFunnel', 'v_bounty_funnel_daily', days), dayCase('catchQuality', 'v_catch_quality', days),
]);

async function expectSameAsView(c: Case): Promise<Row[]> {
  const res = await callAdmin({ q: c.name, ...c.params }, userToken(ADMIN));
  expect(res.status, c.name).toBe(200);
  const actual = c.only ? (res.body as Row[]).map(c.only) : res.body as Row[];
  const expected = c.after ? c.after(await asBrowser(ADMIN, c.view)) : await asBrowser(ADMIN, c.view);
  expect(c.key ? byKey(actual, c.key) : actual, c.name).toEqual(c.key ? byKey(expected, c.key) : expected);
  return actual;
}

describe('요청 검증과 관리자 판정', () => {
  it('GET 외 메서드는 405다', async () => {
    expect(await callAdmin({ q: 'users' }, userToken(ADMIN), 'POST')).toMatchObject({ status: 405, body: { error: 'method-not-allowed' } });
  });

  it('토큰이 없거나 확인되지 않으면 모든 조회가 401이다', async () => {
    for (const c of [...CASES, { name: 'access', params: undefined }]) {
      expect(await callAdmin({ q: c.name, ...c.params }), c.name).toMatchObject({ status: 401, body: { error: 'unauthorized' } });
      expect(await callAdmin({ q: c.name, ...c.params }, 'bad.token.here'), c.name).toMatchObject({ status: 401 });
    }
  });

  it('관리자 명부에 없는 사용자는 모든 조회가 403이고 데이터를 받지 못한다', async () => {
    for (const c of CASES) {
      const res = await callAdmin({ q: c.name, ...c.params }, userToken(PLAYER));
      expect(res, c.name).toMatchObject({ status: 403, body: { error: 'forbidden' } });
      expect(res.body, c.name).toEqual({ error: 'forbidden' });
    }
    // 조회 이름이 틀려도 판정이 먼저다. 비관리자에게 이름의 유효 여부를 알려 주지 않는다
    expect((await callAdmin({ q: 'nope' }, userToken(PLAYER))).status).toBe(403);
  });

  it('계정이 없는 사용자의 유효한 토큰은 403이다', async () => {
    expect((await callAdmin({ q: 'users' }, userToken(testUid(999)))).status).toBe(403);
  });

  it('접근 판정: 명부에 있으면 granted, 없으면 denied이고 세션 uid를 함께 돌려준다', async () => {
    expect(await callAdmin({ q: 'access' }, userToken(ADMIN))).toMatchObject({ status: 200, body: { kind: 'granted', uid: ADMIN } });
    const denied = await callAdmin({ q: 'access' }, userToken(PLAYER));
    expect(denied).toMatchObject({ status: 200 });
    expect(denied.body).toEqual({ kind: 'denied', uid: PLAYER });
  });

  it('모든 응답은 캐시하지 않는다', async () => {
    for (const res of [
      await callAdmin({ q: 'users' }, userToken(ADMIN)),
      await callAdmin({ q: 'access' }, userToken(PLAYER)),
      await callAdmin({ q: 'users' }, userToken(PLAYER)),
      await callAdmin({ q: 'users' }),
      await callAdmin({ q: 'users' }, userToken(ADMIN), 'POST'),
    ]) {
      expect(res.headers['cache-control']).toBe('private, no-store');
    }
  });

  it('조회 이름과 인자가 틀리면 관리자에게 400이다', async () => {
    const token = userToken(ADMIN);
    const wrong: Record<string, string>[] = [
      {}, { q: 'nope' }, { q: 'constructor' }, { q: '__proto__' },
      { q: 'dailyActive' }, { q: 'dailyActive', days: '0' }, { q: 'dailyActive', days: '91' },
      { q: 'dailyActive', days: '1.5' }, { q: 'economy', days: 'abc' }, { q: 'catchQuality', days: '-1' },
      { q: 'userEvents' }, { q: 'userEvents', user: 'not-a-uuid' }, { q: 'userEvents', user: PLAYER, limit: 'x' },
    ];
    for (const query of wrong) {
      const res = await callAdmin(query, token);
      expect(res.status, JSON.stringify(query)).toBe(400);
    }
    expect((await callAdmin({ q: 'nope' }, token)).body).toEqual({ error: 'bad-query' });
    expect((await callAdmin({ q: 'economy', days: '91' }, token)).body).toEqual({ error: 'bad-days' });
    expect((await callAdmin({ q: 'userEvents', user: 'x' }, token)).body).toEqual({ error: 'bad-user' });
  });

  it('명부에서 빠진 사용자는 다음 요청부터 403이다', async () => {
    await env.client.query('delete from public.admins where user_id = $1', [ADMIN]);
    try {
      expect((await callAdmin({ q: 'users' }, userToken(ADMIN))).status).toBe(403);
      expect((await callAdmin({ q: 'access' }, userToken(ADMIN))).body).toEqual({ kind: 'denied', uid: ADMIN });
    } finally {
      await env.client.query('insert into public.admins (user_id) values ($1)', [ADMIN]);
    }
    expect((await callAdmin({ q: 'users' }, userToken(ADMIN))).status).toBe(200);
  });

  it('JWT secret이 없으면 인증 서버 조회로 같은 사용자를 확인한다', async () => {
    const secret = process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_JWT_SECRET;
    try {
      expect((await callAdmin({ q: 'access' }, userToken(ADMIN))).body).toEqual({ kind: 'granted', uid: ADMIN });
      expect((await callAdmin({ q: 'access' }, 'bad.token.here')).status).toBe(401);
    } finally {
      process.env.SUPABASE_JWT_SECRET = secret;
    }
  });

  it('DATABASE_URL이 없으면 500 server-config다', async () => {
    const url = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(await callAdmin({ q: 'users' }, userToken(ADMIN))).toMatchObject({ status: 500, body: { error: 'server-config' } });
    } finally {
      process.env.DATABASE_URL = url;
    }
  });

  it('조회가 실패하면 500 db-read다', async () => {
    await env.client.query('alter table public.letters rename to letters_unavailable');
    try {
      expect(await callAdmin({ q: 'letters' }, userToken(ADMIN))).toMatchObject({ status: 500, body: { error: 'db-read' } });
    } finally {
      await env.client.query('alter table public.letters_unavailable rename to letters');
    }
  });
});

describe('데이터가 없는 상태', () => {
  it.each([...CASES, ...DAY_CASES].map(c => [`${c.name} ${c.params?.days ?? ''}`.trim(), c] as const))('%s: 뷰·함수와 같은 빈 결과를 준다', async (_label, c) => {
    const actual = await expectSameAsView(c);
    if (c.name === 'users') expect(actual).toHaveLength(5);
    else if (c.name === 'dailyActive') expect(actual.every(r => r.dau === 0 && r.wau7 === 0)).toBe(true);
    else expect(actual).toEqual([]);
  });

  it('dailyActive: 오늘부터 days일의 날짜를 모두 채워 최신순으로 준다', async () => {
    const today = await kstToday();
    const one = (await callAdmin({ q: 'dailyActive', days: '1' }, userToken(ADMIN))).body as Row[];
    expect(one.map(r => r.day)).toEqual([today]);
    const week = (await callAdmin({ q: 'dailyActive', days: '7' }, userToken(ADMIN))).body as Row[];
    expect(week).toHaveLength(7);
    expect(week[0].day).toBe(today);
    expect(week.map(r => r.day)).toEqual([...week.map(r => r.day)].sort().reverse());
    expect(((await callAdmin({ q: 'dailyActive', days: '90' }, userToken(ADMIN))).body as Row[])).toHaveLength(90);
  });
});

describe('조회 결과', () => {
  const event = (uid: string, type: string, payload: Row, ago: string) => env.client.query(
    `insert into public.events (user_id, type, payload, created_at) values ($1, $2, $3, now() - $4::interval)`,
    [uid, type, payload, ago]);

  beforeAll(async () => {
    // 플레이어: 1초 간격 연타 4건(PERFECT 3건), 미끼 사용 1건. 다른 어종 1건
    await event(PLAYER, 'catch', { fishId: 'carp', form: 'normal', judgment: 'perfect', size: 12.5, bait: 'worm' }, '10800 seconds');
    await event(PLAYER, 'catch', { fishId: 'carp', form: 'normal', judgment: 'perfect', size: 20.25 }, '10799 seconds');
    await event(PLAYER, 'catch', { fishId: 'carp', form: 'normal', judgment: 'perfect', size: 30 }, '10798 seconds');
    await event(PLAYER, 'catch', { fishId: 'minnow', form: 'normal', judgment: 'good', size: 7.5 }, '10797 seconds');
    // 관리자: 이틀 전 느린 캐치 3건과 의뢰 퍼널 이벤트
    for (const [i, ago] of ['2 days', '47 hours 59 minutes', '47 hours 58 minutes'].entries()) {
      await event(ADMIN, 'catch', { fishId: 'carp', form: 'normal', judgment: i === 0 ? 'good' : 'normal', size: 15 }, ago);
    }
    await event(ADMIN, 'acceptQuest', { questId: 'pacific-named-1' }, '5 hours');
    await event(ADMIN, 'acceptQuest', { questId: 'harbor-general-3' }, '5 hours');
    await event(ADMIN, 'ticket', { questId: 'pacific-named-1' }, '4 hours');
    await event(ADMIN, 'resolveChallenge', { success: true }, '3 hours');
    await event(ADMIN, 'resolveChallenge', { success: false }, '3 hours');
    await event(ADMIN, 'deliverBounty', { questId: 'pacific-named-1' }, '2 hours');
    await event(ADMIN, 'deliverBounty', { questId: 'harbor-general-3' }, '2 hours');
    // 제재된 익명 사용자: 기간 경계의 캐치(30일 밖, 7일 경계 안팎. 이벤트 id 순서가 시간 순서가 되게 오래된 것부터),
    // 골드 원장 이벤트와 반입 기록
    await event(GUEST, 'catch', { fishId: 'tuna', form: 'normal', judgment: 'perfect', size: 80 }, '40 days');
    await event(GUEST, 'catch', { fishId: 'tuna', form: 'normal', judgment: 'perfect', size: 70 }, '8 days');
    await event(GUEST, 'catch', { fishId: 'tuna', form: 'normal', judgment: 'perfect', size: 60 }, '7 days');
    await event(GUEST, 'catch', { fishId: 'tuna', form: 'normal', judgment: 'good', size: 50 }, '6 days');
    await event(GUEST, 'sell', { gold: 100 }, '1 hour');
    await event(GUEST, 'sell', { gold: 250 }, '2 hours');
    await event(GUEST, 'coupon', { gold: 500 }, '1 day');
    await event(GUEST, 'claimMail', { mailId: 1, gold: 250 }, '1 day');
    await event(GUEST, 'upgradeRod', { cost: 80 }, '1 day');
    await event(GUEST, 'buyBoat', { cost: 1000 }, '2 days');
    await event(GUEST, 'buyBait', { cost: 30 }, '30 minutes');
    await event(GUEST, 'import', { gold: 5000, fame: 100 }, '20 minutes');
    await event(GUEST, 'import', { gold: 70, fame: 1 }, '3 days');
    // 리텐션: 열흘 전 코호트(저장 없는 두 사용자 중 하나만 다음 날과 사흘 뒤에 돌아왔다)
    await event(IDLE_A, 'boot', {}, '10 days');
    await event(IDLE_B, 'boot', {}, '10 days');
    await event(IDLE_A, 'boot', {}, '9 days');
    await event(IDLE_A, 'boot', {}, '7 days');
    // 최근 이벤트 피드의 상한(80행)을 넘기는 부팅 기록
    await env.client.query(`insert into public.events (user_id, type, payload, created_at)
      select $1, 'boot', '{}'::jsonb, now() - (g || ' minutes')::interval from generate_series(1, 85) g`, [IDLE_B]);
    // 도감: 관리자는 캐치 이벤트보다 도감이 많고, 플레이어는 이벤트와 도감이 같다
    await env.client.query(`insert into public.records (user_id, fish_id, form, count, max_size, first_caught) values
      ($1, 'carp', 'normal', 5, 15, '2026-10-16'), ($1, 'minnow', 'normal', 2, 5, '2026-10-16'),
      ($2, 'carp', 'normal', 3, 30, '2026-10-18'), ($2, 'minnow', 'normal', 1, 7.5, '2026-10-18')`, [ADMIN, PLAYER]);
    // 편지
    await env.client.query(`insert into public.letters (user_id, text, created_at) values
      ($1, '바다가 좋아요', now() - interval '1 day'), ($2, '안녕하세요', now() - interval '2 days'), ($3, '문의합니다', now() - interval '3 days')`,
    [PLAYER, ADMIN, GUEST]);
  });

  it.each([...CASES, ...DAY_CASES].map(c => [`${c.name} ${c.params?.days ?? ''}`.trim(), c] as const))('%s: 뷰·함수와 같은 결과를 준다', async (_label, c) => {
    const actual = await expectSameAsView(c);
    if (c.filled) expect(actual.length).toBeGreaterThan(0);
  });

  it('users: 최근 행동순이고 행동이 없는 사용자는 뒤에 uid순으로 온다', async () => {
    const rows = (await callAdmin({ q: 'users' }, userToken(ADMIN))).body as Row[];
    expect(rows.map(r => r.user_id)).toEqual([PLAYER, ADMIN, GUEST, IDLE_A, IDLE_B]);
    expect(rows[1]).toEqual({
      user_id: ADMIN, email: 'admin@example.test', is_anonymous: false,
      signed_up_at: '2026-10-01T00:00:00+00:00', last_sign_in_at: '2026-10-18T08:30:00+00:00',
      gold: 1200, fame: 80, boat: 1, rod: 4, location_kind: 'region', location_id: 'world', visited: ['village', 'world'],
      restricted: false, save_version: 2, last_action_at: '2026-10-18T09:00:00+00:00',
    });
    expect(rows[2]).toMatchObject({ user_id: GUEST, email: null, is_anonymous: true, restricted: true, last_sign_in_at: null });
    expect(rows[3]).toMatchObject({ user_id: IDLE_A, gold: null, location_kind: null, visited: null, restricted: null, last_action_at: null });
  });

  it('economy·catchQuality·bountyFunnel: 날짜 하한 밖의 날은 빠진다', async () => {
    const all = (await callAdmin({ q: 'economy', days: '90' }, userToken(ADMIN))).body as Row[];
    const today = (await callAdmin({ q: 'economy', days: '1' }, userToken(ADMIN))).body as Row[];
    expect(all.length).toBeGreaterThan(1);
    expect(today.length).toBeLessThan(all.length);
    expect(today.every(r => r.day === all[0].day)).toBe(true);
    expect(((await callAdmin({ q: 'catchQuality', days: '1' }, userToken(ADMIN))).body as Row[]).length).toBeLessThanOrEqual(1);
    expect(((await callAdmin({ q: 'bountyFunnel', days: '1' }, userToken(ADMIN))).body as Row[]).length).toBeLessThanOrEqual(1);
  });

  it('economy: 골드 유입·유출을 일 단위로 합산한다', async () => {
    const rows = (await callAdmin({ q: 'economy', days: '90' }, userToken(ADMIN))).body as Row[];
    const total = (key: string) => rows.reduce((sum, r) => sum + Number(r[key]), 0);
    expect({ sells: total('sells'), sell_gold: total('sell_gold'), coupon_gold: total('coupon_gold'), mail_gold: total('mail_gold'),
      rod_cost: total('rod_cost'), boat_cost: total('boat_cost'), bait_cost: total('bait_cost') })
      .toEqual({ sells: 2, sell_gold: 350, coupon_gold: 500, mail_gold: 250, rod_cost: 80, boat_cost: 1000, bait_cost: 30 });
  });

  it('bountyFunnel: 네임드와 일반 의뢰, 도전권, 결투 승패, 보상을 나누어 센다', async () => {
    const rows = (await callAdmin({ q: 'bountyFunnel', days: '7' }, userToken(ADMIN))).body as Row[];
    const total = (key: string) => rows.reduce((sum, r) => sum + Number(r[key]), 0);
    expect({ named_accepts: total('named_accepts'), tickets: total('tickets'), duels_won: total('duels_won'),
      duels_lost: total('duels_lost'), named_rewards: total('named_rewards'),
      general_accepts: total('general_accepts'), general_rewards: total('general_rewards') })
      .toEqual({ named_accepts: 1, tickets: 1, duels_won: 1, duels_lost: 1, named_rewards: 1, general_accepts: 1, general_rewards: 1 });
  });

  it('spamFlags: 7일 안의 연타와 PERFECT 비율을 사용자별로 주고, 전체 평균은 30일 안의 캐치로 낸다', async () => {
    const rows = (await callAdmin({ q: 'spamFlags' }, userToken(ADMIN))).body as Row[];
    expect(rows.find(r => r.user_id === PLAYER)).toMatchObject({ catches_7d: 4, fast_gap_7d: 3, perfect_pct: 75 });
    expect(rows.find(r => r.user_id === ADMIN)).toMatchObject({ catches_7d: 3, fast_gap_7d: 0, perfect_pct: 0 });
    // 7일 밖(7일·8일·40일 전)의 캐치는 사용자별 수에 들지 않는다
    expect(rows.find(r => r.user_id === GUEST)).toMatchObject({ catches_7d: 1, fast_gap_7d: 0, perfect_pct: 0 });
    // 30일 안의 캐치 10건 중 PERFECT 5건이다. 40일 전 캐치는 들지 않는다
    expect(rows.map(r => r.perfect_pct_global)).toEqual([50, 50, 50]);
  });

  it('catchQuality: 기간 하한은 KST 오늘부터 days일이다. 하한 날짜는 들어오고 하루 앞은 빠진다', async () => {
    const dayAgo = async (n: number) =>
      (await env.client.query(`select (((now() at time zone 'Asia/Seoul')::date) - $1::int)::text as d`, [n])).rows[0].d as string;
    const daysOf = async (n: number) =>
      ((await callAdmin({ q: 'catchQuality', days: String(n) }, userToken(ADMIN))).body as Row[]).map(r => r.day);
    expect(await daysOf(7)).toContain(await dayAgo(6));
    expect(await daysOf(7)).not.toContain(await dayAgo(7));
    expect(await daysOf(8)).toContain(await dayAgo(7));
    expect(await daysOf(30)).not.toContain(await dayAgo(40));
    expect(await daysOf(90)).toContain(await dayAgo(40));
  });

  it('imports: 반입 기록을 id 오름차순으로 준다', async () => {
    const rows = (await callAdmin({ q: 'imports' }, userToken(ADMIN))).body as Row[];
    expect(rows.map(r => [r.gold, r.fame])).toEqual([[5000, 100], [70, 1]]);
    expect(rows.every(r => r.user_id === GUEST)).toBe(true);
  });

  it('dexMismatch: 도감이 캐치 이벤트보다 많은 행만 준다', async () => {
    const rows = (await callAdmin({ q: 'dexMismatch' }, userToken(ADMIN))).body as Row[];
    expect(rows).toEqual([
      { user_id: ADMIN, fish_id: 'carp', form: 'normal', dex_count: 5, event_count: 3, missing_events: 2 },
      { user_id: ADMIN, fish_id: 'minnow', form: 'normal', dex_count: 2, event_count: 0, missing_events: 2 },
    ]);
  });

  it('retention: 첫 행동일 코호트별 재방문률을 준다', async () => {
    const rows = (await callAdmin({ q: 'retention' }, userToken(ADMIN))).body as Row[];
    const cohort = rows.find(r => r.users === 2);
    expect(cohort).toMatchObject({ d1: 50, d3: 50, d7: 0, d14: 0, d30: 0 });
  });

  it('recentEvents: 최신 80행만 id 내림차순으로 준다', async () => {
    const rows = (await callAdmin({ q: 'recentEvents' }, userToken(ADMIN))).body as Row[];
    expect(rows).toHaveLength(80);
    const ids = rows.map(r => Number(r.id));
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });

  it('userEvents: 최신 limit건을 id 오름차순으로 준다. 기본은 500건, 범위는 1~2000건이다', async () => {
    const token = userToken(ADMIN);
    const ids = async (limit?: string) => ((await callAdmin({ q: 'userEvents', user: PLAYER, ...(limit ? { limit } : {}) }, token)).body as Row[]).map(r => Number(r.id));
    const all = await ids();
    expect(all).toHaveLength(4);
    expect(all).toEqual([...all].sort((a, b) => a - b));
    expect(await ids('2')).toEqual(all.slice(2));
    expect(await ids('0')).toEqual(all.slice(3));
    expect(await ids('2001')).toEqual(all);
    expect((await callAdmin({ q: 'userEvents', user: testUid(777) }, token)).body).toEqual([]);
  });

  it('letters: 최신순으로 본문과 보낸 사용자를 준다', async () => {
    const rows = (await callAdmin({ q: 'letters' }, userToken(ADMIN))).body as Row[];
    expect(rows.map(r => [r.user_id, r.text])).toEqual([[PLAYER, '바다가 좋아요'], [ADMIN, '안녕하세요'], [GUEST, '문의합니다']]);
  });
});

describe('우편 보내기', () => {
  const request = (recipients: { userId: string; gold: number }[]) => ({
    title: '환급', body: '강화비 차액을 돌려드려요.', target: { kind: 'users', recipients },
  });

  it('관리자만 보내고 볼 수 있고, 형태가 틀리면 400이다', async () => {
    for (const op of ['preview', 'send']) {
      expect(await callAdmin({ q: 'mail' }, userToken(PLAYER), 'POST', { op, request: request([{ userId: PLAYER, gold: 1 }]) }))
        .toMatchObject({ status: 403 });
    }
    expect(await callAdmin({ q: 'mail' }, null, 'POST', { op: 'send', request: request([{ userId: PLAYER, gold: 1 }]) }))
      .toMatchObject({ status: 401 });
    expect(await callAdmin({ q: 'mails' }, userToken(PLAYER))).toMatchObject({ status: 403 });
    expect(await env.client.query('select 1 from public.mails where user_id = $1', [PLAYER])).toMatchObject({ rows: [] });
    expect(await callAdmin({ q: 'mail' }, userToken(ADMIN), 'POST', { op: 'drop', request: request([]) }))
      .toMatchObject({ status: 400, body: { error: 'bad-mail' } });
    expect(await callAdmin({ q: 'mail' }, userToken(ADMIN), 'POST', { op: 'send', request: { title: 1 } }))
      .toMatchObject({ status: 400, body: { error: 'bad-mail' } });
  });

  it('미리보기는 쓰지 않고, 보내기는 계정이 있는 대상에게 넣는다. 보낸 우편은 조회에 나온다', async () => {
    const ghost = '00000000-0000-4000-8000-000000000999';
    const body = request([{ userId: PLAYER, gold: 700 }, { userId: ghost, gold: 5 }]);
    const preview = await callAdmin({ q: 'mail' }, userToken(ADMIN), 'POST', { op: 'preview', request: body });
    expect(preview).toMatchObject({ status: 200, body: { problems: [], preview: { count: 1, totalGold: 700, missing: [ghost] } } });
    const before = await env.client.query('select 1 from public.mails where user_id = $1', [PLAYER]);
    expect(before.rows).toHaveLength(0);

    const sent = await callAdmin({ q: 'mail' }, userToken(ADMIN), 'POST', { op: 'send', request: body });
    expect(sent).toMatchObject({ status: 200, body: { sent: 1, preview: { count: 1, totalGold: 700 } } });
    const bad = await callAdmin({ q: 'mail' }, userToken(ADMIN), 'POST', { op: 'send', request: { ...body, title: ' ' } });
    expect(bad).toMatchObject({ status: 200, body: { sent: 0, problems: ['title'] } });

    const list = await callAdmin({ q: 'mails' }, userToken(ADMIN));
    expect((list.body as Row[]).filter(r => r.userId === PLAYER)).toMatchObject([{ title: '환급', gold: 700, claimedAt: null }]);
  });
});
