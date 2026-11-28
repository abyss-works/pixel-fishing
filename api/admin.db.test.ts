// 관리자 읽기 함수를 실제 Postgres에서 검사한다. 관리자 판정(401·403)과 조회별 결과를 본다.
// 조회 결과는 관리자 뷰·함수의 결과와 같아야 한다. 같은 데이터를 authenticated 역할과 세션 클레임으로 읽은
// 뷰·함수 결과(PostgREST의 읽기 방식)를 기댓값으로 쓴다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ARTIFACTS, artifactHasLevel } from '../src/game/content/artifacts.js';
import { ACHIEVEMENTS } from '../src/game/content/achievements.js';
import { ENERGY_ITEM_IDS, RECIPES } from '../src/game/content/cooking.js';
import { FISH } from '../src/game/content/fish.js';
import { NAMED } from '../src/game/content/named.js';
import { HATS } from '../src/game/content/wardrobe.js';
import { newState, zoneDexMissing } from '../src/game/rules/logic.js';
import { adminSessionHeaders, seedUser, startActionEnv, testUid, sessionHeaders, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';
import { provideNotify, provideNotifyAll } from './_server/livePresence.js';
import type { ServerMessage } from '../src/game/rules/live.js';

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
  await env.client.query(`update auth.users set created_at = '2026-10-01T00:00:00Z' where id = $1`, [ADMIN]);
  // 마지막 로그인은 세션의 마지막 사용 시각이다. 세션이 없는 계정은 null이다
  await env.client.query(`update auth.sessions set updated_at = '2026-10-18T08:30:00Z' where user_id = $1`, [ADMIN]);
  await env.client.query('delete from auth.sessions where user_id = $1', [GUEST]);
  await env.client.query(`update auth.users set created_at = '2026-10-05T12:00:00Z' where id = $1`, [PLAYER]);
  await env.client.query('insert into public.admins (user_id) values ($1)', [ADMIN]);
});
afterAll(async () => {
  await env?.stop();
});

async function callAdmin(query: Record<string, string>, token: string | null = null, method = 'GET', body?: unknown,
  headers: (token: string | null) => Record<string, string> = adminSessionHeaders): Promise<Out> {
  const { default: handler } = await import('./admin.js');
  const out: Out = { status: 0, body: undefined, headers: {} };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
  };
  await handler({ method, query, body, headers: headers(token) } as never, res as never);
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

/** 기간(days)을 받는 일 단위 조회. 뷰는 day 열로 거른다 */
const dayCase = (name: string, view: string, days: number): Case => ({
  name, params: { days: String(days) }, view: `select * from public.${view} ${sinceDay(days)}`,
  filled: days > 1,
});
const CASES: Case[] = [
  // 닉네임(nickname)과 세션 열(last_session_at·total_session_sec)은 v_admin_users가 만들어진 뒤 더한 열이다. 나머지 열은 뷰와 같아야 한다
  { name: 'users', view: 'select * from public.v_admin_users', key: r => String(r.user_id), filled: true,
    only: ({ nickname: _nickname, last_session_at: _lastSession, total_session_sec: _totalSession, ...rest }: Row) => rest },
  dayCase('bountyFunnel', 'v_bounty_funnel_daily', 7),
  { name: 'spamFlags', view: 'select * from public.v_spam_flags', key: r => String(r.user_id), filled: true },
  { name: 'recentEvents', view: 'select * from public.v_events_recent', filled: true },
  { name: 'userEvents', params: { user: PLAYER, limit: '300' }, view: `select * from public.fn_user_events('${PLAYER}', 300)`,
    after: rows => [...rows].sort((a, b) => Number(a.id) - Number(b.id)), filled: true },
  // 처리 시각(handled_at)은 v_admin_letters가 만들어진 뒤 더한 열이다. 나머지 열은 뷰와 같아야 한다
  { name: 'letters', view: 'select * from public.v_admin_letters', filled: true,
    only: ({ handled_at: _handled, ...rest }: Row) => rest },
];
/** 기간 하한의 경계: 하루, 일주일, 대시보드의 최대 기간 */
const DAY_CASES: Case[] = [1, 7, 90].map(days => dayCase('bountyFunnel', 'v_bounty_funnel_daily', days));

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

  it('게임 세션 쿠키로는 관리자 계정이라도 모든 조회와 쓰기가 401이다', async () => {
    const token = userToken(ADMIN);
    // 게임 쿠키의 값을 관리자 쿠키 이름으로 옮긴 경우. 서명 키가 달라 세션으로 인정되지 않는다
    const renamed = () => ({ cookie: sessionHeaders(token).cookie.replace('better-auth.', 'pixel-fishing-admin.') });
    for (const headers of [sessionHeaders, renamed]) {
      for (const c of [...CASES, { name: 'access', params: undefined }]) {
        expect(await callAdmin({ q: c.name, ...c.params }, token, 'GET', undefined, headers), c.name)
          .toMatchObject({ status: 401, body: { error: 'unauthorized' } });
      }
      expect(await callAdmin({ q: 'restrict' }, token, 'POST', { userId: PLAYER, restricted: true }, headers))
        .toMatchObject({ status: 401 });
    }
  });

  it('계정이 없는 사용자의 토큰은 세션이 없어 401이다', async () => {
    expect((await callAdmin({ q: 'users' }, userToken(testUid(999)))).status).toBe(401);
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
      { q: 'dailyActive', days: '7' }, { q: 'catchQuality', days: '7' }, { q: 'retention' },
      { q: 'economy' }, { q: 'economy', days: '0' }, { q: 'economy', days: '91' },
      { q: 'economy', days: '1.5' }, { q: 'economy', days: 'abc' }, { q: 'bountyFunnel', days: '-1' },
      { q: 'userEvents' }, { q: 'userEvents', user: 'not-a-uuid' }, { q: 'userEvents', user: PLAYER, limit: 'x' },
      { q: 'userState' }, { q: 'userState', uid: 'not-a-uuid' },
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

  it('세션이 없는 토큰은 401이다', async () => {
    expect((await callAdmin({ q: 'access' }, 'no-such-session')).status).toBe(401);
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
    else expect(actual).toEqual([]);
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
    await event(ADMIN, 'deliverBounty', { questId: 'pacific-named-1', reward: 100000 }, '2 hours');
    await event(ADMIN, 'deliverBounty', { questId: 'harbor-general-3', reward: 15000 }, '2 hours');
    // 제재된 익명 사용자: 기간 경계의 캐치(30일 밖, 7일 경계 안팎. 이벤트 id 순서가 시간 순서가 되게 오래된 것부터),
    // 골드 원장 이벤트
    await event(GUEST, 'catch', { fishId: 'tuna', form: 'normal', judgment: 'perfect', size: 80 }, '40 days');
    await event(GUEST, 'catch', { fishId: 'tuna', form: 'normal', judgment: 'perfect', size: 70 }, '8 days');
    await event(GUEST, 'catch', { fishId: 'tuna', form: 'normal', judgment: 'perfect', size: 60 }, '7 days');
    await event(GUEST, 'catch', { fishId: 'tuna', form: 'normal', judgment: 'good', size: 50 }, '6 days');
    await event(GUEST, 'sell', { gold: 100 }, '1 hour');
    await event(GUEST, 'sell', { gold: 250 }, '2 hours');
    await event(GUEST, 'coupon', { gold: 500 }, '1 day');
    await event(GUEST, 'claimMail', { mailId: 1, gold: 250 }, '1 day');
    await event(GUEST, 'claimAchievement', { id: 'catch-10', gold: 1000 }, '1 day');
    await event(GUEST, 'claimAllAchievements', { ids: ['a'], gold: 2000, hats: [] }, '1 day');
    await event(GUEST, 'upgradeRod', { cost: 80 }, '1 day');
    await event(GUEST, 'buyBoat', { cost: 1000 }, '2 days');
    await event(GUEST, 'buyHat', { hat: 'cap-red', cost: 50000 }, '30 minutes');
    // 리텐션: 열흘 전 코호트(저장 없는 두 사용자 중 하나만 다음 날과 사흘 뒤에 돌아왔다)
    await event(IDLE_A, 'boot', {}, '10 days');
    await event(IDLE_B, 'boot', {}, '10 days');
    await event(IDLE_A, 'boot', {}, '9 days');
    await event(IDLE_A, 'boot', {}, '7 days');
    // 최근 이벤트 피드의 상한(80행)을 넘기는 부팅 기록
    await env.client.query(`insert into public.events (user_id, type, payload, created_at)
      select $1, 'boot', '{}'::jsonb, now() - (g || ' minutes')::interval from generate_series(1, 85) g`, [IDLE_B]);
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
      user_id: ADMIN, email: 'admin@example.test', nickname: '운영', is_anonymous: false,
      signed_up_at: '2026-10-01T00:00:00+00:00', last_sign_in_at: '2026-10-18T08:30:00+00:00',
      gold: 1200, fame: 80, boat: 1, rod: 4, location_kind: 'region', location_id: 'world', visited: ['village', 'world'],
      restricted: false, save_version: 2, last_action_at: '2026-10-18T09:00:00+00:00',
      last_session_at: null, total_session_sec: 0,
    });
    expect(rows[2]).toMatchObject({ user_id: GUEST, email: null, nickname: null, is_anonymous: true, restricted: true, last_sign_in_at: null });
    expect(rows[3]).toMatchObject({ user_id: IDLE_A, gold: null, location_kind: null, visited: null, restricted: null, last_action_at: null });
  });

  it('economy·bountyFunnel: 날짜 하한 밖의 날은 빠진다', async () => {
    const all = (await callAdmin({ q: 'economy', days: '90' }, userToken(ADMIN))).body as Row[];
    const today = (await callAdmin({ q: 'economy', days: '1' }, userToken(ADMIN))).body as Row[];
    expect(all.length).toBeGreaterThan(1);
    expect(today.length).toBeLessThan(all.length);
    expect(today.every(r => r.day === all[0].day)).toBe(true);
    expect(((await callAdmin({ q: 'bountyFunnel', days: '1' }, userToken(ADMIN))).body as Row[]).length).toBeLessThanOrEqual(1);
  });

  it('economy: 골드 유입·유출을 일 단위로 합산한다', async () => {
    const rows = (await callAdmin({ q: 'economy', days: '90' }, userToken(ADMIN))).body as Row[];
    const total = (key: string) => rows.reduce((sum, r) => sum + Number(r[key]), 0);
    expect({ sells: total('sells'), sell_gold: total('sell_gold'), coupon_gold: total('coupon_gold'), mail_gold: total('mail_gold'),
      bounty_gold: total('bounty_gold'), achievement_gold: total('achievement_gold'),
      rod_cost: total('rod_cost'), boat_cost: total('boat_cost'), hat_cost: total('hat_cost') })
      .toEqual({ sells: 2, sell_gold: 350, coupon_gold: 500, mail_gold: 250, bounty_gold: 115000, achievement_gold: 3000,
        rod_cost: 80, boat_cost: 1000, hat_cost: 50000 });
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

  it('userState: 대상 플레이어의 도감·토벌·유물·모자·업적·기운/요리·개체 수를 돌려준다', async () => {
    const leveledArt = ARTIFACTS.find(a => artifactHasLevel(a))!;
    const fixedArt = ARTIFACTS.find(a => !artifactHasLevel(a))!;
    const hat = HATS[0];
    const [achClaimed, achClaimable] = ACHIEVEMENTS;
    const lunchRecipe = RECIPES.find(r => r.kind === 'lunch')!;
    const baitRecipe = RECIPES.find(r => r.kind === 'bait')!;
    const normalFish = FISH[0];
    const variantFish = FISH[1];
    const namedFish = NAMED[0];

    await env.client.query(`insert into public.records (user_id, fish_id, form, count) values
      ($1, $2, 'normal', 2), ($1, $3, 'variant', 1), ($1, $4, 'normal', 1)`,
    [PLAYER, normalFish.id, variantFish.id, namedFish.id]);
    await env.client.query(`insert into public.bounty_clears (user_id, kind, quest_id) values
      ($1, 'named', 'pacific-named-1'), ($1, 'named', 'pacific-named-1'), ($1, 'named', 'seasia-named-1')`,
    [PLAYER]);
    await env.client.query(`insert into public.fish_instances (uid, user_id, fish_id, form, slot) values
      ($2, $1, $4, 'normal', null), ($3, $1, $4, 'variant', null), ($5, $1, $4, 'normal', 0)`,
    [PLAYER, testUid(9901), testUid(9902), normalFish.id, testUid(9903)]);
    await env.client.query(`insert into public.achievement_counters (user_id, key, value) values
      ($1, 'catches', 12)`,
    [PLAYER]);
    await env.client.query(`update public.saves_current set data = data || $2::jsonb where user_id = $1`, [PLAYER, JSON.stringify({
      artifacts: [leveledArt.id, fixedArt.id],
      artifactLevels: { [leveledArt.id]: 3 },
      hats: [hat.id],
      achievements: { [achClaimed.id]: 'claimed', [achClaimable.id]: 'claimable' },
      items: { [ENERGY_ITEM_IDS.common]: 20, [ENERGY_ITEM_IDS.rare]: 5, [lunchRecipe.id]: 2 },
      cooking: { id: 'cook-admin-1', recipe: baitRecipe.id, count: 1, startedAt: '2026-10-18T09:50:00.000Z' },
      cookingQueue: [{ id: 'cook-queue-1', recipe: lunchRecipe.id, count: 2, bonus: [false, false] }],
      slots: {
        lunch: { id: lunchRecipe.id, endsAt: '2026-10-18T11:00:00.000Z' },
        bait: { id: baitRecipe.id, endsAt: '2026-10-18T10:05:00.000Z' },
      },
    })]);

    const res = await callAdmin({ q: 'userState', uid: PLAYER }, userToken(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      hasSave: true,
      dex: {
        normal: 1,
        normalTotal: FISH.length,
        variant: 1,
        variantTotal: FISH.length,
        named: 1,
        namedTotal: NAMED.length,
      },
      bounty: { namedClears: 3, namedDistinctClears: 2, namedTotal: NAMED.length },
      artifacts: {
        owned: [
          { id: leveledArt.id, name: leveledArt.name, grade: leveledArt.grade, level: 3 },
          { id: fixedArt.id, name: fixedArt.name, grade: fixedArt.grade, level: null },
        ],
        total: ARTIFACTS.length,
      },
      hats: {
        owned: 1,
        total: HATS.length,
        items: [{ id: hat.id, name: hat.name, source: hat.source }],
        equipped: null,
      },
      achievements: {
        claimed: 1,
        claimable: 1,
        total: ACHIEVEMENTS.length,
        counters: { catches: 12 },
      },
      cooking: {
        energy: { common: 20, rare: 5, epic: 0, legendary: 0 },
        cooked: [{ id: lunchRecipe.id, name: lunchRecipe.name, kind: lunchRecipe.kind, count: 2 }],
        inProgress: {
          id: 'cook-admin-1',
          recipe: baitRecipe.id,
          name: baitRecipe.name,
          count: 1,
          startedAt: '2026-10-18T09:50:00.000Z',
        },
        queue: [
          {
            id: 'cook-queue-1',
            recipe: lunchRecipe.id,
            name: lunchRecipe.name,
            count: 2,
          },
        ],
        slots: {
          lunch: { id: lunchRecipe.id, name: lunchRecipe.name, endsAt: '2026-10-18T11:00:00.000Z' },
          bait: { id: baitRecipe.id, name: baitRecipe.name, endsAt: '2026-10-18T10:05:00.000Z' },
        },
      },
      instances: {
        bag: 2,
        exhibit: 1,
        recentBag: expect.arrayContaining([
          expect.objectContaining({ fishId: normalFish.id, name: normalFish.name, form: 'normal' }),
          expect.objectContaining({ fishId: normalFish.id, name: normalFish.name, form: 'variant' }),
        ]),
      },
      progression: {
        visited: ['village'],
        coupons: [],
        bountyProgress: [],
        bountyTickets: [],
        activeSessions: expect.any(Number),
      },
    });

    const emptyRes = await callAdmin({ q: 'userState', uid: IDLE_A }, userToken(ADMIN));
    expect(emptyRes.status).toBe(200);
    expect(emptyRes.body).toMatchObject({
      hasSave: false,
      dex: { normal: 0, variant: 0, named: 0 },
      bounty: { namedClears: 0, namedDistinctClears: 0 },
      artifacts: { owned: [] },
      hats: { owned: 0, items: [], equipped: null },
      achievements: { claimed: 0, claimable: 0, counters: {} },
      instances: { bag: 0, exhibit: 0, recentBag: [] },
      progression: { visited: [], coupons: [], bountyProgress: [], bountyTickets: [] },
    });
  });

  it('userState: 미접속(achievements={}) 계정도 records·네임드 토벌 근거로 claimable을 쓰기 없이 파생 집계한다', async () => {
    const UNBOOTED = testUid(908);
    const dex: Record<string, { normal: { count: number; maxSize: number; first: string } }> = {};
    for (const id of zoneDexMissing(newState(), 'pacific', ['common', 'rare', 'epic'])) {
      dex[id] = { normal: { count: 1, maxSize: 30, first: '2026-01-01' } };
    }
    await seedUser(env.client, { uid: UNBOOTED, email: 'unbooted@example.test', nickname: '미부팅', state: { dex, achievements: {} }, version: 4 });
    await env.client.query(
      `insert into public.bounty_clears (user_id, kind, quest_id) values ($1, 'named', 'pacific-named-megalodon')`,
      [UNBOOTED],
    );

    const res = await callAdmin({ q: 'userState', uid: UNBOOTED }, userToken(ADMIN));
    expect(res.status).toBe(200);
    expect((res.body as { achievements: { claimed: number; claimable: number } }).achievements).toMatchObject({
      claimed: 0,
      claimable: 3, // spot-basic-sea, spot-basic-deep, named-megalodon-1
    });

    const dbRow = (await env.client.query<{ version: string; achievements: unknown }>(
      `select version, data->'achievements' as achievements from public.saves_current where user_id = $1`,
      [UNBOOTED],
    )).rows[0];
    expect(Number(dbRow.version)).toBe(4);
    expect(dbRow.achievements).toEqual({});
  });

  it('overview: 개요 탭에 필요한 명부·최근 이벤트·스팸 플래그·일별 집계·리텐션·세션·실시간 접속을 한 번에 돌려준다', async () => {
    const res = await callAdmin({ q: 'overview', days: '7' }, userToken(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      users: expect.any(Array),
      recentEvents: expect.any(Array),
      spamFlags: expect.any(Array),
      dailyStats: expect.any(Array),
      retention: expect.any(Array),
      sessions: expect.any(Array),
      live: { count: 0, online: [] },
    });
    expect((res.body as { users: Row[] }).users.length).toBeGreaterThanOrEqual(5);
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

  it('chatReports: 관리자만 읽고 최신순으로 신고와 대화 복사본을 준다', async () => {
    await env.client.query(`insert into public.chat_reports (user_id, message_id, target_id, lines, created_at) values
      ($1, 1, $2, '[{"id":1,"uid":"x","nick":"n","text":"먼저","at":"a"}]', now() - interval '2 days'),
      ($1, 2, $2, '[{"id":2,"uid":"x","nick":"n","text":"나중","at":"a"}]', now() - interval '1 day')`, [PLAYER, GUEST]);
    expect((await callAdmin({ q: 'chatReports' }, userToken(PLAYER))).status).toBe(403);
    const rows = (await callAdmin({ q: 'chatReports' }, userToken(ADMIN))).body as Row[];
    expect(rows.map(r => [r.user_id, r.message_id, r.target_id, (r.lines as { text: string }[])[0].text]))
      .toEqual([[PLAYER, 2, GUEST, '나중'], [PLAYER, 1, GUEST, '먼저']]);
  });

  it('letters: 최신순으로 본문과 보낸 사용자를 준다', async () => {
    const rows = (await callAdmin({ q: 'letters' }, userToken(ADMIN))).body as Row[];
    expect(rows.map(r => [r.user_id, r.text])).toEqual([[PLAYER, '바다가 좋아요'], [ADMIN, '안녕하세요'], [GUEST, '문의합니다']]);
  });

  it('changelog: 관리자만 읽고 최신 버전부터 버전 안 순번 순서로 줄 모양을 camelCase로 준다', async () => {
    expect((await callAdmin({ q: 'changelog' }, userToken(PLAYER))).status).toBe(403);
    expect((await callAdmin({ q: 'changelog' })).status).toBe(401);
    expect((await callAdmin({ q: 'changelog' }, userToken(ADMIN))).body).toEqual([]);
    await env.client.query(`insert into public.changelog_entries (id, version, date, seq, tier, tag, text, withdrawn_at) values
      ('0.9.0-01', '0.9.0', '2026-10-01', 1, 'public', '기능', '아홉 번째', null),
      ('0.10.0-02', '0.10.0', '2026-10-20', 2, 'admin', '수정', '열 번째 관리자', null),
      ('0.10.0-01', '0.10.0', '2026-10-20', 1, 'public', 'UI', '열 번째 공개', '2026-10-21T00:00:00Z')`);
    const rows = (await callAdmin({ q: 'changelog' }, userToken(ADMIN))).body as Row[];
    expect(rows).toEqual([
      { id: '0.10.0-01', version: '0.10.0', date: '2026-10-20', seq: 1, tier: 'public', tag: 'UI', text: '열 번째 공개', withdrawnAt: '2026-10-21T00:00:00+00:00' },
      { id: '0.10.0-02', version: '0.10.0', date: '2026-10-20', seq: 2, tier: 'admin', tag: '수정', text: '열 번째 관리자', withdrawnAt: null },
      { id: '0.9.0-01', version: '0.9.0', date: '2026-10-01', seq: 1, tier: 'public', tag: '기능', text: '아홉 번째', withdrawnAt: null },
    ]);
  });

  it('changelog: 등급은 public과 admin만 받는다', async () => {
    await expect(env.client.query(`insert into public.changelog_entries (id, version, date, seq, tier, tag, text)
      values ('0.8.0-01', '0.8.0', '2026-09-01', 1, 'internal', '기타', 'x')`)).rejects.toThrow();
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

describe('관리자 조치', () => {
  const TARGET = testUid(906); // 제재·세션 종료 대상인 가입 사용자
  const NO_SAVE = testUid(907); // 저장 상태가 없는 가입 사용자
  const post = (q: string, body: unknown, token: string | null = userToken(ADMIN)) => callAdmin({ q }, token, 'POST', body);
  const restrictedOf = async (uid: string) =>
    (await env.client.query('select restricted from public.saves_current where user_id = $1', [uid])).rows[0]?.restricted as boolean | undefined;
  const adminEvents = async (uid: string) => (await env.client.query(
    `select type, payload from public.events where user_id = $1 and type like 'admin%' order by id`, [uid])).rows as Row[];

  beforeAll(async () => {
    await seedUser(env.client, { uid: TARGET, email: 'target@example.test', nickname: '대상', state: { gold: 5, fame: 1 } });
    await seedUser(env.client, { uid: NO_SAVE, email: 'nosave@example.test', nickname: '저장없음' });
    await env.client.query(`insert into auth.accounts (user_id, account_id, provider_id) values ($1::uuid, 'no-save-google', 'google')`, [NO_SAVE]);
  });

  it('관리자가 아니면 403, 세션이 없으면 401이고 아무것도 바꾸지 않는다', async () => {
    for (const [q, body] of [['restrict', { userId: TARGET, restricted: true }]] as const) {
      expect(await post(q, body, userToken(PLAYER)), q).toMatchObject({ status: 403, body: { error: 'forbidden' } });
      expect(await post(q, body, null), q).toMatchObject({ status: 401 });
    }
    expect(await restrictedOf(TARGET)).toBe(false);
    expect(await adminEvents(TARGET)).toEqual([]);
  });

  it('형태가 틀린 요청은 400이다', async () => {
    for (const body of [null, {}, { userId: 'x', restricted: true }, { userId: TARGET }, { userId: TARGET, restricted: 'yes' }]) {
      expect(await post('restrict', body), JSON.stringify(body)).toMatchObject({ status: 400, body: { error: 'bad-restrict' } });
    }
  });

  it('제재와 해제는 저장 상태의 restricted를 바꾸고, 조치마다 관리자 id를 담은 이벤트를 남긴다', async () => {
    expect(await post('restrict', { userId: TARGET, restricted: true })).toMatchObject({ status: 200, body: { restricted: true } });
    expect(await restrictedOf(TARGET)).toBe(true);
    expect(await post('restrict', { userId: TARGET, restricted: false })).toMatchObject({ status: 200, body: { restricted: false } });
    expect(await restrictedOf(TARGET)).toBe(false);
    expect(await adminEvents(TARGET)).toEqual([
      { type: 'adminRestrict', payload: { adminId: ADMIN } },
      { type: 'adminUnrestrict', payload: { adminId: ADMIN } },
    ]);
  });

  it('저장 상태가 없는 계정은 제재할 수 없어 404이고 이벤트도 남기지 않는다', async () => {
    expect(await post('restrict', { userId: NO_SAVE, restricted: true })).toMatchObject({ status: 404, body: { error: 'no-save' } });
    expect(await adminEvents(NO_SAVE)).toEqual([]);
  });

  it('폐지된 resetLink 쓰기는 허용하지 않는다', async () => {
    expect(await post('resetLink', { userId: TARGET })).toMatchObject({ status: 405, body: { error: 'method-not-allowed' } });
    expect((await env.client.query(`select 1 from auth.verifications where value = $1`, [TARGET])).rows).toEqual([]);
  });

  it('편지 처리 표시는 처음 처리한 시각을 남기고 취소하면 비운다. 관리자만 바꾸고 형식이 틀리면 400, 없는 편지는 404다', async () => {
    const { rows } = await env.client.query(`insert into public.letters (user_id, text) values ($1, '답장 주세요') returning id`, [TARGET]);
    const letterId = Number(rows[0].id);
    const handledAt = async () => (await env.client.query('select handled_at from public.letters where id = $1', [letterId])).rows[0].handled_at as Date | null;

    expect(await post('letterHandled', { letterId, handled: true }, userToken(PLAYER))).toMatchObject({ status: 403 });
    expect(await handledAt()).toBeNull();
    for (const body of [null, { letterId }, { letterId: '1', handled: true }, { letterId: 0, handled: true }, { letterId: 1.5, handled: false }]) {
      expect(await post('letterHandled', body), JSON.stringify(body)).toMatchObject({ status: 400, body: { error: 'bad-letter' } });
    }
    expect(await post('letterHandled', { letterId: 999999, handled: true })).toMatchObject({ status: 404, body: { error: 'no-letter' } });

    expect(await post('letterHandled', { letterId, handled: true })).toMatchObject({ status: 200, body: { handled: true } });
    const first = await handledAt();
    expect(first).toBeInstanceOf(Date);
    await post('letterHandled', { letterId, handled: true });
    expect(await handledAt()).toEqual(first);
    const listed = ((await callAdmin({ q: 'letters' }, userToken(ADMIN))).body as Row[]).find(r => Number(r.id) === letterId);
    expect(listed?.handled_at).toEqual(expect.any(String));

    expect(await post('letterHandled', { letterId, handled: false })).toMatchObject({ status: 200, body: { handled: false } });
    expect(await handledAt()).toBeNull();
  });

  it('revokeSessions: 대상 계정의 auth.sessions 행을 삭제하고 adminRevokeSessions 이벤트를 남긴다', async () => {
    expect(await post('revokeSessions', { userId: TARGET }, userToken(PLAYER))).toMatchObject({ status: 403 });
    expect(await post('revokeSessions', { userId: TARGET }, null)).toMatchObject({ status: 401 });
    expect(await post('revokeSessions', { userId: 'nope' })).toMatchObject({ status: 400, body: { error: 'bad-user' } });
    expect(await post('revokeSessions', { userId: testUid(998) })).toMatchObject({ status: 404, body: { error: 'no-user' } });

    // 대상 계정의 활성 세션을 명시적으로 심는다
    await env.client.query(
      `insert into auth.sessions (user_id, token, expires_at) values ($1, $2, '2100-01-01T00:00:00Z')
       on conflict (token) do nothing`,
      [TARGET, `revoke-test-${TARGET}`],
    );
    const before = await env.client.query('select 1 from auth.sessions where user_id = $1', [TARGET]);
    expect(before.rows.length).toBeGreaterThan(0);

    const res = await post('revokeSessions', { userId: TARGET });
    expect(res).toMatchObject({ status: 200, body: { revoked: before.rows.length } });
    const after = await env.client.query('select 1 from auth.sessions where user_id = $1', [TARGET]);
    expect(after.rows).toEqual([]);
    expect(await adminEvents(TARGET)).toContainEqual({
      type: 'adminRevokeSessions',
      payload: { adminId: ADMIN, revoked: before.rows.length },
    });
  });

  it('notices: 관리자만 조회·작성·수정·즉시 마감·삭제할 수 있고 잘못된 입력은 400이다', async () => {
    expect(await callAdmin({ q: 'notices' }, userToken(PLAYER))).toMatchObject({ status: 403 });
    expect(await callAdmin({ q: 'notices' })).toMatchObject({ status: 401 });
    expect(await post('notices', { op: 'end', id: 1 }, userToken(PLAYER))).toMatchObject({ status: 403 });
    expect(await post('notices', {
      op: 'create', title: '', body: '본문',
      startsAt: '2030-01-01T00:00:00.000Z', endsAt: '2030-01-02T00:00:00.000Z',
    })).toMatchObject({ status: 400, body: { error: 'bad-title' } });

    const createdRes = await post('notices', {
      op: 'create',
      title: '  점검 공지  ',
      body: '  내용입니다.  ',
      startsAt: '2030-06-01T00:00:00.000Z',
      endsAt: '2030-06-02T00:00:00.000Z',
    });
    expect(createdRes.status).toBe(200);
    const created = (createdRes.body as { notice: { id: number; title: string; body: string; createdBy: string | null } }).notice;
    expect(created).toMatchObject({ title: '점검 공지', body: '내용입니다.', createdBy: ADMIN });

    const listed = await callAdmin({ q: 'notices' }, userToken(ADMIN));
    expect(listed.status).toBe(200);
    expect((listed.body as { id: number }[]).map(n => n.id)).toContain(created.id);

    const updatedRes = await post('notices', {
      op: 'update',
      id: created.id,
      title: '수정 공지',
      body: '수정 내용',
      startsAt: '2030-06-03T00:00:00.000Z',
      endsAt: '2030-06-04T00:00:00.000Z',
    });
    expect(updatedRes).toMatchObject({ status: 200, body: { notice: { id: created.id, title: '수정 공지' } } });

    const broadcasted: ServerMessage[] = [];
    provideNotifyAll(msg => { broadcasted.push(msg); });
    try {
      const endedRes = await post('notices', { op: 'end', id: created.id });
      expect(endedRes.status).toBe(200);
      expect(broadcasted.at(-1)).toMatchObject({
        t: 'notices',
        notices: [expect.objectContaining({ id: created.id, title: '수정 공지' })],
      });
      expect(await post('notices', { op: 'delete', id: created.id })).toMatchObject({
        status: 200,
        body: { deleted: true, id: created.id },
      });
      expect(broadcasted.at(-1)).toEqual({ t: 'notices', notices: [] });
    } finally {
      provideNotifyAll(() => {});
    }
    expect(await post('notices', { op: 'delete', id: created.id })).toMatchObject({
      status: 404,
      body: { error: 'no-notice' },
    });
  });

  it('라이브 이벤트 CRUD, 당첨자 추첨(우편·PIN·실시간 알림), 당첨 이력 조회를 검증한다', async () => {
    const post = (q: string, body: unknown) => callAdmin({ q }, userToken(ADMIN), 'POST', body);

    expect(await post('events', { op: 'create', id: 'bad id' })).toMatchObject({
      status: 400, body: { error: 'bad-event' },
    });

    const createdRes = await post('events', {
      op: 'create',
      id: 'evt-admin-trio',
      kind: 'trio',
      title: '관리자 삼총사',
      description: '설명',
      startsAt: '2030-07-01T00:00:00.000Z',
      endsAt: '2030-07-10T00:00:00.000Z',
      active: true,
    });
    expect(createdRes).toMatchObject({
      status: 200,
      body: { event: { id: 'evt-admin-trio', kind: 'trio', title: '관리자 삼총사', active: true } },
    });

    expect(await post('events', {
      op: 'create',
      id: 'evt-admin-trio',
      kind: 'trio',
      title: '중복',
      description: '중복',
      startsAt: '2030-07-01T00:00:00.000Z',
      endsAt: '2030-07-10T00:00:00.000Z',
      active: true,
    })).toMatchObject({ status: 409, body: { error: 'duplicate-event' } });

    expect(await post('events', {
      op: 'update',
      id: 'evt-admin-trio',
      title: '수정된 삼총사',
      description: '수정 설명',
      startsAt: '2030-07-01T00:00:00.000Z',
      endsAt: '2030-07-11T00:00:00.000Z',
      active: true,
      config: {},
    })).toMatchObject({
      status: 200,
      body: { event: { id: 'evt-admin-trio', title: '수정된 삼총사' } },
    });

    const listRes = await callAdmin({ q: 'events' }, userToken(ADMIN));
    expect(listRes.status).toBe(200);
    expect((listRes.body as { id: string }[]).map(e => e.id)).toContain('evt-admin-trio');

    // 완료자 시드 후 추첨 → event_draws + public.mails + notifyUser({ t: 'mail' })
    await env.client.query(
      `insert into public.event_trio_progress (event_id, user_id, counts, completed_at)
       values ('evt-admin-trio', $1, '{"crucian:normal":1}'::jsonb, '2030-07-02T00:00:00.000Z')`,
      [PLAYER],
    );
    const notified: Array<{ uid: string; msg: ServerMessage }> = [];
    provideNotify((uid, msg) => { notified.push({ uid, msg }); });
    try {
      const drawRes = await post('events', {
        op: 'draw',
        id: 'evt-admin-trio',
        count: 1,
        rewardPin: 'PIN-ADMIN-9999',
        rewardExpiresAt: '2030-08-01T00:00:00.000Z',
      });
      expect(drawRes).toMatchObject({
        status: 200,
        body: {
          event: { id: 'evt-admin-trio' },
          seed: expect.any(String),
          eligibleCount: 1,
          draws: [expect.objectContaining({
            userId: PLAYER,
            rewardPin: 'PIN-ADMIN-9999',
            drawnBy: ADMIN,
          })],
        },
      });
      expect((drawRes.body as { seed: string }).seed.length).toBeGreaterThan(0);
      expect(notified).toEqual([{ uid: PLAYER, msg: { t: 'mail' } }]);
    } finally {
      provideNotify(() => {});
    }

    const drawsRes = await callAdmin({ q: 'eventDraws', eventId: 'evt-admin-trio' }, userToken(ADMIN));
    expect(drawsRes.status).toBe(200);
    expect(drawsRes.body).toEqual([
      expect.objectContaining({
        eventId: 'evt-admin-trio',
        userId: PLAYER,
        rewardPin: 'PIN-ADMIN-9999',
        drawnBy: ADMIN,
      }),
    ]);

    const drawMailId = (drawsRes.body as { mailId: number | null }[])[0].mailId;
    expect(drawMailId).toBeGreaterThan(0);
    const mailRes = await env.client.query<{ user_id: string; title: string; body: string }>(
      `select user_id::text, title, body from public.mails where id = $1`,
      [drawMailId],
    );
    expect(mailRes.rows).toHaveLength(1);
    expect(mailRes.rows[0].user_id).toBe(PLAYER);
    expect(mailRes.rows[0].body).toContain('PIN-ADMIN-9999');

    const endedRes = await post('events', { op: 'end', id: 'evt-admin-trio' });
    expect(endedRes.status).toBe(200);
    expect(Date.parse((endedRes.body as { event: { endsAt: string } }).event.endsAt))
      .toBeLessThan(Date.parse('2030-07-11T00:00:00.000Z'));
    expect(await post('events', { op: 'delete', id: 'evt-admin-trio' })).toMatchObject({
      status: 200, body: { deleted: true, id: 'evt-admin-trio' },
    });
    expect(await post('events', { op: 'delete', id: 'evt-admin-trio' })).toMatchObject({
      status: 404, body: { error: 'no-event' },
    });
  });

  it('동적 쿠폰 CRUD(아이템·기간·수량 제한)와 정적 쿠폰 보호를 검증한다', async () => {
    const post = (q: string, body: unknown) => callAdmin({ q }, userToken(ADMIN), 'POST', body);

    expect(await post('coupons', { op: 'create', code: '출항준비', gold: 100, description: '정적' })).toMatchObject({
      status: 400, body: { error: 'bad-coupon' },
    });

    const createdRes = await post('coupons', {
      op: 'create',
      code: 'ADMIN-EVENT-COUPON',
      gold: 500,
      description: '관리자 발급 쿠폰',
      items: [{ id: 'luck-small', qty: 2 }],
      startsAt: '2030-07-01T00:00:00.000Z',
      endsAt: '2030-07-31T00:00:00.000Z',
      maxRedemptions: 100,
      perAccountLimit: 1,
      active: true,
    });
    expect(createdRes).toMatchObject({
      status: 200,
      body: {
        coupon: {
          code: 'ADMIN-EVENT-COUPON',
          gold: 500,
          items: [{ id: 'luck-small', qty: 2 }],
          maxRedemptions: 100,
          perAccountLimit: 1,
          active: true,
        },
      },
    });

    expect(await post('coupons', {
      op: 'create',
      code: 'ADMIN-EVENT-COUPON',
      gold: 100,
      description: '중복',
    })).toMatchObject({ status: 409, body: { error: 'duplicate-coupon' } });

    expect(await post('coupons', {
      op: 'update',
      code: 'ADMIN-EVENT-COUPON',
      gold: 750,
      items: [{ id: 'luck-small', qty: 2 }],
      description: '수정된 설명',
      startsAt: '2030-07-01T00:00:00.000Z',
      endsAt: '2030-07-31T00:00:00.000Z',
      maxRedemptions: 100,
      perAccountLimit: 1,
      active: false,
    })).toMatchObject({
      status: 200,
      body: { coupon: { code: 'ADMIN-EVENT-COUPON', gold: 750, active: false } },
    });

    const listed = await callAdmin({ q: 'coupons' }, userToken(ADMIN));
    expect(listed.status).toBe(200);
    expect((listed.body as { code: string }[]).map(c => c.code)).toContain('ADMIN-EVENT-COUPON');

    expect(await post('coupons', { op: 'delete', code: 'ADMIN-EVENT-COUPON' })).toMatchObject({
      status: 200, body: { deleted: true, code: 'ADMIN-EVENT-COUPON' },
    });
    expect(await post('coupons', { op: 'delete', code: 'ADMIN-EVENT-COUPON' })).toMatchObject({
      status: 404, body: { error: 'no-coupon' },
    });
  });
});

describe('역할 분리(admin·maintainer) · Zero-PII 투영 · 배지 토글 · 감사 로그', () => {
  const MAINT = testUid(919);

  beforeAll(async () => {
    await seedUser(env.client, {
      uid: MAINT,
      email: 'maint@example.test',
      nickname: '메인테이너',
      state: { gold: 500, fame: 10, boat: 2, rod: 3 },
    });
    await env.client.query(`insert into public.admins (user_id, role) values ($1, 'maintainer')`, [MAINT]);
    await env.client.query(
      `insert into public.changelog_entries (id, version, date, seq, tier, tag, text) values
        ('0.21.0-01', '0.21.0', '2026-11-27', 1, 'public', '기능', '공개 패치노트 항목'),
        ('0.21.0-02', '0.21.0', '2026-11-27', 2, 'admin', '기타', '관리자 내부 수치 항목')
      on conflict (id) do nothing`,
    );
    await env.client.query(
      `insert into public.events (user_id, type, payload) values
        ($1, 'letter', '{"text":"제 연락처는 secret@example.test 입니다"}'::jsonb),
        ($1, 'adminRestrict', $2::jsonb)`,
      [PLAYER, JSON.stringify({ adminId: ADMIN })],
    );
  });

  it('isAdmin은 role=admin만 참이고, isStaff는 admin과 maintainer 모두 참이다', async () => {
    const { database } = await import('./_db/client.js');
    const { isAdmin, isStaff, adminMember } = await import('./_data/admin.js');
    const { db } = database();

    expect(await isAdmin(db, ADMIN)).toBe(true);
    expect(await isAdmin(db, MAINT)).toBe(false);
    expect(await isAdmin(db, PLAYER)).toBe(false);

    expect(await isStaff(db, ADMIN)).toBe(true);
    expect(await isStaff(db, MAINT)).toBe(true);
    expect(await isStaff(db, PLAYER)).toBe(false);

    expect(await adminMember(db, ADMIN)).toEqual({ role: 'admin', showStaffBadge: false });
    expect(await adminMember(db, MAINT)).toEqual({ role: 'maintainer', showStaffBadge: false });
    expect(await adminMember(db, PLAYER)).toBeNull();
  });

  it('access는 역할·배지·capabilities를 돌려주고, maintainer도 게임 내 모든 운영 읽기·쓰기를 수행한다', async () => {
    expect(await callAdmin({ q: 'access' }, userToken(ADMIN))).toMatchObject({
      status: 200,
      body: {
        kind: 'granted',
        uid: ADMIN,
        role: 'admin',
        showStaffBadge: false,
        capabilities: { canViewEmail: true },
      },
    });
    expect(await callAdmin({ q: 'access' }, userToken(MAINT))).toMatchObject({
      status: 200,
      body: {
        kind: 'granted',
        uid: MAINT,
        role: 'maintainer',
        showStaffBadge: false,
        capabilities: { canViewEmail: false },
      },
    });

    for (const [q, extra] of [
      ['userState', { uid: PLAYER }],
      ['userEvents', { user: PLAYER }],
      ['letters', {}],
      ['mails', {}],
      ['events', {}],
      ['eventDraws', { eventId: 'evt-1' }],
    ] as const) {
      expect((await callAdmin({ q, ...extra }, userToken(MAINT))).status, `GET ${q}`).toBe(200);
    }

    expect(await callAdmin({ q: 'mail' }, userToken(MAINT), 'POST', {
      op: 'preview',
      request: { title: 't', body: 'b', target: { kind: 'all', gold: 10 } },
    })).toMatchObject({ status: 200 });
  });

  it('maintainer의 모든 허용 응답(overview·users·userSearch·spamFlags·recentEvents·chatReports·changelog)은 이메일·계정메타만 제거하고 UUID·인게임 필드는 유지한다', async () => {
    const { provideOnline } = await import('./_server/livePresence.js');
    provideOnline(() => [
      { uid: PLAYER, nick: '플레이어', region: 'world', zone: 'pacific', connectedAt: '2030-01-01T00:00:00.000Z', guest: false },
    ]);
    try {
      const token = userToken(MAINT);
      const rawEmails = ['admin@example.test', 'player@example.test', 'maint@example.test'];

      const assertNoEmailPii = (label: string, payload: unknown) => {
        const serialized = JSON.stringify(payload);
        for (const email of rawEmails) expect(serialized, `${label} email ${email}`).not.toContain(email);
      };

      const overviewRes = await callAdmin({ q: 'overview', days: '7' }, token);
      expect(overviewRes.status).toBe(200);
      assertNoEmailPii('overview', overviewRes.body);
      const ov = overviewRes.body as { live: { online: Row[] } };
      expect(ov.live.online).toHaveLength(1);
      expect(ov.live.online[0].email).toBeNull();
      expect(ov.live.online[0].uid).toBe(PLAYER);

      const usersRes = await callAdmin({ q: 'users' }, token);
      expect(usersRes.status).toBe(200);
      assertNoEmailPii('users', usersRes.body);
      const userRows = usersRes.body as Row[];
      const playerRow = userRows.find(r => r.nickname === '플레이어')!;
      expect(playerRow).toMatchObject({
        user_id: PLAYER,
        email: null,
        nickname: '플레이어',
        is_anonymous: false,
        signed_up_at: null,
        last_sign_in_at: null,
        boat: 0,
        restricted: false,
      });
      expect(playerRow.gold).not.toBeNull();

      // userSearch: admin은 이메일 검색 가능, maintainer는 닉네임·UUID만 검색 가능(이메일 검색 불가)
      const adminSearchByEmail = await callAdmin({ q: 'userSearch', term: 'player@example.test' }, userToken(ADMIN));
      expect(adminSearchByEmail.status).toBe(200);
      expect((adminSearchByEmail.body as Row[]).some(r => r.user_id === PLAYER)).toBe(true);

      const maintSearchByEmail = await callAdmin({ q: 'userSearch', term: 'player@example.test' }, token);
      expect(maintSearchByEmail.status).toBe(200);
      expect(maintSearchByEmail.body).toEqual([]);

      const maintSearchByNick = await callAdmin({ q: 'userSearch', term: '플레이어' }, token);
      expect(maintSearchByNick.status).toBe(200);
      assertNoEmailPii('userSearch', maintSearchByNick.body);
      expect((maintSearchByNick.body as Row[])[0]).toMatchObject({
        user_id: PLAYER,
        email: null,
        signed_up_at: null,
        last_sign_in_at: null,
        nickname: '플레이어',
      });

      const maintSearchByUid = await callAdmin({ q: 'userSearch', term: PLAYER.slice(0, 8) }, token);
      expect(maintSearchByUid.status).toBe(200);
      expect((maintSearchByUid.body as Row[]).some(r => r.user_id === PLAYER)).toBe(true);

      const spamRes = await callAdmin({ q: 'spamFlags' }, token);
      expect(spamRes.status).toBe(200);
      assertNoEmailPii('spamFlags', spamRes.body);
      expect((spamRes.body as Row[]).some(r => r.user_id === PLAYER)).toBe(true);

      const eventsRes = await callAdmin({ q: 'recentEvents' }, token);
      expect(eventsRes.status).toBe(200);
      assertNoEmailPii('recentEvents', eventsRes.body);

      const reportsRes = await callAdmin({ q: 'chatReports' }, token);
      expect(reportsRes.status).toBe(200);
      assertNoEmailPii('chatReports', reportsRes.body);
      const reportRows = reportsRes.body as { user_id: string; target_id: string; lines: { uid: string }[] }[];
      expect(reportRows[0].user_id).toBe('');
      expect(reportRows[0].target_id).toBe(GUEST);
      expect(reportRows[0].lines[0].uid).toBe('x');

      const changelogRes = await callAdmin({ q: 'changelog' }, token);
      expect(changelogRes.status).toBe(200);
      const clRows = changelogRes.body as { tier: string; id: string }[];
      expect(clRows.length).toBeGreaterThan(0);
      expect(clRows.some(r => r.tier === 'admin')).toBe(true);
      expect(clRows.map(r => r.id)).toContain('0.21.0-02');

      // 집계·밸런스 지표는 maintainer에게도 200 허용
      for (const [q, extra] of [
        ['economy', { days: '7' }],
        ['bountyFunnel', { days: '7' }],
        ['onboardingFunnel', {}],
        ['httpMetrics', { days: '7' }],
        ['clientMetrics', { days: '7' }],
        ['opsHealth', { days: '7' }],
        ['balanceLive', { days: '7' }],
      ] as const) {
        expect((await callAdmin({ q, ...extra }, token)).status, q).toBe(200);
      }
    } finally {
      provideOnline(() => []);
    }
  });

  it('staffBadge 토글과 restrict·revokeSessions·mail·notices 감사 로그(admin_audit_logs) 기록을 검증한다', async () => {
    await env.client.query('delete from public.admin_audit_logs');

    // maintainer 본인 배지 켜기 → 본인 행만 바뀌고 admin 행은 false 유지
    const toggleRes = await callAdmin({ q: 'staffBadge' }, userToken(MAINT), 'POST', { show: true });
    expect(toggleRes).toMatchObject({ status: 200, body: { showStaffBadge: true } });
    expect((await callAdmin({ q: 'access' }, userToken(MAINT))).body).toMatchObject({ showStaffBadge: true });
    expect((await callAdmin({ q: 'access' }, userToken(ADMIN))).body).toMatchObject({ showStaffBadge: false });

    // maintainer 공지 작성·수정·종료·삭제 허용 및 감사 로그 기록
    const noticeRes = await callAdmin({ q: 'notices' }, userToken(MAINT), 'POST', {
      op: 'create',
      title: '메인테이너 공지',
      body: '공지 본문입니다.',
      startsAt: '2030-01-01T00:00:00.000Z',
      endsAt: '2030-01-02T00:00:00.000Z',
    });
    expect(noticeRes.status).toBe(200);
    const noticeId = (noticeRes.body as { notice: { id: number } }).notice.id;
    expect((await callAdmin({ q: 'notices' }, userToken(MAINT), 'POST', { op: 'delete', id: noticeId })).status).toBe(200);

    // admin 제재·세션 종료·우편 발송 감사 로그
    expect((await callAdmin({ q: 'restrict' }, userToken(ADMIN), 'POST', { userId: PLAYER, restricted: true })).status).toBe(200);
    expect((await callAdmin({ q: 'restrict' }, userToken(ADMIN), 'POST', { userId: PLAYER, restricted: false })).status).toBe(200);
    expect((await callAdmin({ q: 'revokeSessions' }, userToken(ADMIN), 'POST', { userId: PLAYER })).status).toBe(200);
    expect((await callAdmin({ q: 'mail' }, userToken(ADMIN), 'POST', {
      op: 'send',
      request: {
        title: '감사 우편',
        body: '본문',
        target: { kind: 'users', recipients: [{ userId: PLAYER, gold: 100 }] },
      },
    })).status).toBe(200);

    const { rows: logs } = await env.client.query<{ actor_id: string; actor_role: string; action: string; target_id: string | null }>(
      `select actor_id::text, actor_role, action, target_id::text from public.admin_audit_logs order by id`,
    );
    expect(logs).toEqual([
      { actor_id: MAINT, actor_role: 'maintainer', action: 'staffBadge', target_id: MAINT },
      { actor_id: MAINT, actor_role: 'maintainer', action: 'notices.create', target_id: null },
      { actor_id: MAINT, actor_role: 'maintainer', action: 'notices.delete', target_id: null },
      { actor_id: ADMIN, actor_role: 'admin', action: 'restrict', target_id: PLAYER },
      { actor_id: ADMIN, actor_role: 'admin', action: 'unrestrict', target_id: PLAYER },
      { actor_id: ADMIN, actor_role: 'admin', action: 'revokeSessions', target_id: PLAYER },
      { actor_id: ADMIN, actor_role: 'admin', action: 'mail.send', target_id: PLAYER },
    ]);
  });

  it('maintainer와 admin 모두 GET/POST ?q=notices에서 createdBy 원본 UUID를 유지한다', async () => {
    const adminCreate = await callAdmin({ q: 'notices' }, userToken(ADMIN), 'POST', {
      op: 'create',
      title: '관리자 공지',
      body: '관리자 공지 본문',
      startsAt: '2030-01-01T00:00:00.000Z',
      endsAt: '2030-01-02T00:00:00.000Z',
    });
    expect(adminCreate.status).toBe(200);
    const adminNotice = (adminCreate.body as { notice: { id: number; createdBy: string } }).notice;
    expect(adminNotice.createdBy).toBe(ADMIN);

    const maintCreate = await callAdmin({ q: 'notices' }, userToken(MAINT), 'POST', {
      op: 'create',
      title: '메인테이너 작성 공지',
      body: '메인테이너 공지 본문',
      startsAt: '2030-01-03T00:00:00.000Z',
      endsAt: '2030-01-04T00:00:00.000Z',
    });
    expect(maintCreate.status).toBe(200);
    const maintNotice = (maintCreate.body as { notice: { id: number; createdBy: string } }).notice;
    expect(maintNotice.createdBy).toBe(MAINT);

    try {
      const maintList = await callAdmin({ q: 'notices' }, userToken(MAINT));
      expect(maintList.status).toBe(200);
      const maintRows = maintList.body as { id: number; createdBy: string | null }[];
      expect(maintRows.find(r => r.id === adminNotice.id)?.createdBy).toBe(ADMIN);
      expect(maintRows.find(r => r.id === maintNotice.id)?.createdBy).toBe(MAINT);

      const maintUpdate = await callAdmin({ q: 'notices' }, userToken(MAINT), 'POST', {
        op: 'update',
        id: adminNotice.id,
        title: '수정된 관리자 공지',
        body: '수정 본문',
        startsAt: '2030-01-01T00:00:00.000Z',
        endsAt: '2030-01-02T00:00:00.000Z',
      });
      expect(maintUpdate.status).toBe(200);
      expect((maintUpdate.body as { notice: { createdBy: string } }).notice.createdBy).toBe(ADMIN);

      const maintEnd = await callAdmin({ q: 'notices' }, userToken(MAINT), 'POST', {
        op: 'end',
        id: adminNotice.id,
      });
      expect(maintEnd.status).toBe(200);
      expect((maintEnd.body as { notice: { createdBy: string } }).notice.createdBy).toBe(ADMIN);
    } finally {
      await callAdmin({ q: 'notices' }, userToken(ADMIN), 'POST', { op: 'delete', id: adminNotice.id });
      await callAdmin({ q: 'notices' }, userToken(ADMIN), 'POST', { op: 'delete', id: maintNotice.id });
    }
  });

  it('maintainer의 GET ?q=overview는 이메일·계정메타만 제거한 users와 정확한 비영 userAggregates를 반환한다', async () => {
    await env.client.query(`update public.saves_current set updated_at = now() where user_id = $1`, [MAINT]);
    const adminRes = await callAdmin({ q: 'overview', days: '7' }, userToken(ADMIN));
    const maintRes = await callAdmin({ q: 'overview', days: '7' }, userToken(MAINT));
    expect(adminRes.status).toBe(200);
    expect(maintRes.status).toBe(200);

    const adminOv = adminRes.body as {
      users: {
        user_id: string;
        email: string | null;
        nickname: string | null;
        is_anonymous: boolean | null;
        signed_up_at: string | null;
        last_sign_in_at: string | null;
        gold: number | string | null;
        fame: number | string | null;
        boat: number | null;
        rod: number | null;
        visited: string[] | null;
        restricted: boolean | null;
        last_action_at: string | null;
        last_session_at: string | null;
      }[];
      userAggregates: {
        totalUsers: number;
        activePlayers: number;
        asOf: string;
        activeUsers: { today: number; week: number; month: number };
        newToday: { users: number; accounts: number };
        gold: { count: number; sum: number; median: number | null; p75: number | null; max: number | null };
        progression: {
          boats: { tier: number; count: number }[];
          rods: { level: number; count: number }[];
          regionReach: { id: string; count: number }[];
          zoneUnlocks: { id: string; count: number }[];
          fameGateStalled: { total: number; byNextTier: { nextTier: number; count: number }[] };
        };
      };
    };
    const maintOv = maintRes.body as typeof adminOv;

    // maintainer의 users는 이메일·가입/로그인 시각만 null이고 user_id와 게임 내 필드는 유지된다
    const maintPlayer = maintOv.users.find(u => u.nickname === '플레이어')!;
    expect(maintPlayer).toMatchObject({
      user_id: PLAYER,
      email: null,
      signed_up_at: null,
      last_sign_in_at: null,
      restricted: false,
    });
    expect(maintPlayer.gold).not.toBeNull();

    // userAggregates는 비어 있지 않고 admin/maintainer 간 산식이 동일하다
    const agg = maintOv.userAggregates;
    expect(agg).toBeDefined();
    expect(agg.totalUsers).toBe(adminOv.users.length);
    expect(agg.activePlayers).toBeGreaterThan(0);
    expect(agg.activePlayers).toBeLessThan(agg.totalUsers); // IDLE_A·IDLE_B 휴면 게스트 제외
    expect(agg.activeUsers.today).toBeGreaterThan(0);
    expect(agg.activeUsers.week).toBeGreaterThanOrEqual(agg.activeUsers.today);
    expect(agg.activeUsers.month).toBeGreaterThanOrEqual(agg.activeUsers.week);
    expect(agg.newToday.users).toBeGreaterThan(0);
    expect(agg.newToday.accounts).toBeGreaterThan(0);
    expect(agg.gold.count).toBeGreaterThan(0);
    expect(agg.gold.sum).toBeGreaterThan(0);
    expect(agg.gold.median).not.toBeNull();
    expect(agg.gold.p75).not.toBeNull();
    expect(agg.gold.max).toBe(1200);
    expect(agg.progression.rods.length).toBeGreaterThan(0);
    expect(agg.progression.regionReach.find(r => r.id === 'village')?.count).toBeGreaterThan(0);
    expect(agg.progression.regionReach.find(r => r.id === 'world')?.count).toBeGreaterThan(0);
    expect(agg.progression.fameGateStalled.total).toBeGreaterThan(0);
    expect(agg.progression.fameGateStalled.byNextTier.length).toBeGreaterThan(0);

    // admin과 maintainer 집계 결과 일치(시각 경계 제외 동일 데이터)
    expect({ ...agg, asOf: '' }).toEqual({ ...adminOv.userAggregates, asOf: '' });

    // PII/식별자 필드가 userAggregates에 일체 포함되지 않음을 검증
    const aggJson = JSON.stringify(agg);
    for (const u of adminOv.users) {
      expect(aggJson).not.toContain(u.user_id);
      if (u.email) expect(aggJson).not.toContain(u.email);
      if (u.nickname) expect(aggJson).not.toContain(u.nickname);
    }
    expect(aggJson).not.toMatch(/op_[0-9a-f]{10}/);
    for (const forbiddenKey of ['"user_id"', '"opHandle"', '"nickname"', '"email"']) {
      expect(aggJson).not.toContain(forbiddenKey);
    }
  });

  it('maintainer와 admin 모두 ?q=coupons CRUD를 수행하고 admin_audit_logs에 감사 로그가 기록된다', async () => {
    await env.client.query('delete from public.admin_audit_logs');

    const postAs = (uid: string, body: unknown) => callAdmin({ q: 'coupons' }, userToken(uid), 'POST', body);

    // maintainer 실패 요청(정적 충돌 400·미존재 404)은 감사 로그를 남기지 않는다
    expect(await postAs(MAINT, { op: 'create', code: '출항준비', gold: 100, description: '정적 충돌' })).toMatchObject({
      status: 400,
      body: { error: 'bad-coupon' },
    });
    expect(await postAs(MAINT, { op: 'delete', code: 'NO-SUCH-COUPON' })).toMatchObject({
      status: 404,
      body: { error: 'no-coupon' },
    });

    // maintainer: 생성(품목 포함) -> 중복(409) -> 조회 -> 수정(활성 토글) -> 삭제
    const maintCreated = await postAs(MAINT, {
      op: 'create',
      code: 'MAINT-CRUD-COUPON',
      gold: 300,
      items: [{ id: 'luck-small', qty: 2 }],
      description: '메인테이너 생성 쿠폰',
      maxRedemptions: 50,
      perAccountLimit: 1,
      active: true,
    });
    expect(maintCreated).toMatchObject({
      status: 200,
      body: {
        coupon: {
          code: 'MAINT-CRUD-COUPON',
          gold: 300,
          items: [{ id: 'luck-small', qty: 2 }],
          active: true,
          maxRedemptions: 50,
          perAccountLimit: 1,
        },
      },
    });

    expect(await postAs(MAINT, {
      op: 'create',
      code: 'MAINT-CRUD-COUPON',
      gold: 100,
      description: '중복 코드',
    })).toMatchObject({ status: 409, body: { error: 'duplicate-coupon' } });

    const maintList = await callAdmin({ q: 'coupons' }, userToken(MAINT));
    expect(maintList.status).toBe(200);
    expect((maintList.body as { code: string }[]).map(c => c.code)).toContain('MAINT-CRUD-COUPON');

    expect(await postAs(MAINT, {
      op: 'update',
      code: 'MAINT-CRUD-COUPON',
      gold: 400,
      items: [{ id: 'luck-small', qty: 3 }],
      description: '메인테이너 수정 쿠폰',
      active: false,
      startsAt: null,
      endsAt: null,
      maxRedemptions: 80,
      perAccountLimit: 2,
    })).toMatchObject({
      status: 200,
      body: {
        coupon: {
          code: 'MAINT-CRUD-COUPON',
          gold: 400,
          items: [{ id: 'luck-small', qty: 3 }],
          active: false,
          maxRedemptions: 80,
          perAccountLimit: 2,
        },
      },
    });

    expect(await postAs(MAINT, { op: 'delete', code: 'MAINT-CRUD-COUPON' })).toMatchObject({
      status: 200,
      body: { deleted: true, code: 'MAINT-CRUD-COUPON' },
    });

    // admin: 생성 -> 수정 -> 삭제
    expect(await postAs(ADMIN, {
      op: 'create',
      code: 'ADMIN-AUDIT-COUPON',
      gold: 150,
      items: [],
      description: '관리자 쿠폰',
    })).toMatchObject({ status: 200, body: { coupon: { code: 'ADMIN-AUDIT-COUPON' } } });

    expect(await postAs(ADMIN, {
      op: 'update',
      code: 'ADMIN-AUDIT-COUPON',
      gold: 200,
      items: [],
      description: '관리자 수정',
      active: false,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      perAccountLimit: 1,
    })).toMatchObject({ status: 200, body: { coupon: { code: 'ADMIN-AUDIT-COUPON', gold: 200, active: false } } });

    expect(await postAs(ADMIN, { op: 'delete', code: 'ADMIN-AUDIT-COUPON' })).toMatchObject({
      status: 200,
      body: { deleted: true, code: 'ADMIN-AUDIT-COUPON' },
    });

    const { rows: logs } = await env.client.query<{
      actor_id: string;
      actor_role: string;
      action: string;
      target_id: string | null;
      reason: string;
      detail: Record<string, unknown>;
    }>(
      `select actor_id::text, actor_role, action, target_id::text, reason, detail
       from public.admin_audit_logs
       order by id`,
    );
    expect(logs).toEqual([
      {
        actor_id: MAINT,
        actor_role: 'maintainer',
        action: 'couponCreate',
        target_id: null,
        reason: 'MAINT-CRUD-COUPON',
        detail: {
          code: 'MAINT-CRUD-COUPON',
          gold: 300,
          itemsCount: 1,
          active: true,
          maxRedemptions: 50,
          perAccountLimit: 1,
        },
      },
      {
        actor_id: MAINT,
        actor_role: 'maintainer',
        action: 'couponUpdate',
        target_id: null,
        reason: 'MAINT-CRUD-COUPON',
        detail: {
          code: 'MAINT-CRUD-COUPON',
          gold: 400,
          itemsCount: 1,
          active: false,
          maxRedemptions: 80,
          perAccountLimit: 2,
        },
      },
      {
        actor_id: MAINT,
        actor_role: 'maintainer',
        action: 'couponDelete',
        target_id: null,
        reason: 'MAINT-CRUD-COUPON',
        detail: { code: 'MAINT-CRUD-COUPON' },
      },
      {
        actor_id: ADMIN,
        actor_role: 'admin',
        action: 'couponCreate',
        target_id: null,
        reason: 'ADMIN-AUDIT-COUPON',
        detail: {
          code: 'ADMIN-AUDIT-COUPON',
          gold: 150,
          itemsCount: 0,
          active: true,
          maxRedemptions: null,
          perAccountLimit: 1,
        },
      },
      {
        actor_id: ADMIN,
        actor_role: 'admin',
        action: 'couponUpdate',
        target_id: null,
        reason: 'ADMIN-AUDIT-COUPON',
        detail: {
          code: 'ADMIN-AUDIT-COUPON',
          gold: 200,
          itemsCount: 0,
          active: false,
          maxRedemptions: null,
          perAccountLimit: 1,
        },
      },
      {
        actor_id: ADMIN,
        actor_role: 'admin',
        action: 'couponDelete',
        target_id: null,
        reason: 'ADMIN-AUDIT-COUPON',
        detail: { code: 'ADMIN-AUDIT-COUPON' },
      },
    ]);
  });

  it('clientMetrics: flushClientMetrics 합산 upsert와 GET ?q=clientMetrics 조회(Zero-PII)를 검증한다', async () => {
    const { database } = await import('./_db/client.js');
    const { emptyClientCounts, flushClientMetrics } = await import('./_data/clientMetrics.js');
    const { kstDayOf } = await import('./_server/httpMetrics.js');
    const today = kstDayOf(Date.now());
    await env.client.query('delete from public.client_metrics_daily');

    await flushClientMetrics(database().db, [
      {
        day: today,
        ...emptyClientCounts(),
        reports: 1,
        lcpLe1500: 1,
        lcpSumMs: 1200,
        lcpCount: 1,
        actionRttLe100: 2,
        actionRttSumMs: 160,
        actionRttCount: 2,
        actionConflicts409: 1,
        canvasFrames: 100,
        canvasLongFrames: 2,
      },
      {
        day: today,
        ...emptyClientCounts(),
        reports: 1,
        lcpLe2500: 1,
        lcpSumMs: 2200,
        lcpCount: 1,
        clsSumX1000: 50,
        clsCount: 1,
        meRttLe250: 1,
        meRttSumMs: 180,
        meRttCount: 1,
        meTimeouts: 1,
        canvasFrames: 100,
        canvasLongFrames: 8,
        wsReconnects: 1,
        wsAbnormalCloses: 2,
      },
    ]);

    expect(await callAdmin({ q: 'clientMetrics', days: '0' }, userToken(ADMIN))).toMatchObject({
      status: 400,
      body: { error: 'bad-days' },
    });

    const maintRes = await callAdmin({ q: 'clientMetrics', days: '7' }, userToken(MAINT));
    expect(maintRes.status).toBe(200);
    expect(maintRes.body).toEqual({
      days: 7,
      summary: {
        reports: 2,
        lcp: { p50Ms: 1500, p95Ms: 2500, avgMs: 1700, samples: 2 },
        inp: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0 },
        ttfb: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0 },
        clsAvg: 0.05,
        actionRtt: { p50Ms: 100, p95Ms: 100, avgMs: 80, samples: 2, timeouts: 0, conflicts409: 1 },
        meRtt: { p50Ms: 250, p95Ms: 250, avgMs: 180, samples: 1, timeouts: 1 },
        canvasFrames: 200,
        canvasLongFrames: 10,
        longFramePct: 5,
        wsReconnects: 1,
        wsAbnormalCloses: 2,
      },
      daily: [
        {
          day: today,
          reports: 2,
          lcp: { p50Ms: 1500, p95Ms: 2500, avgMs: 1700, samples: 2 },
          inp: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0 },
          ttfb: { p50Ms: null, p95Ms: null, avgMs: null, samples: 0 },
          clsAvg: 0.05,
          actionRtt: { p50Ms: 100, p95Ms: 100, avgMs: 80, samples: 2, timeouts: 0, conflicts409: 1 },
          meRtt: { p50Ms: 250, p95Ms: 250, avgMs: 180, samples: 1, timeouts: 1 },
          canvasFrames: 200,
          canvasLongFrames: 10,
          longFramePct: 5,
          wsReconnects: 1,
          wsAbnormalCloses: 2,
        },
      ],
    });
  });

  it('POST ?q=coupons는 maxRedemptions·perAccountLimit int4 상한(2_147_483_647)을 허용하고 초과 시 400으로 거부한다', async () => {
    const post = (body: unknown) => callAdmin({ q: 'coupons' }, userToken(MAINT), 'POST', body);

    expect(await post({
      op: 'create',
      code: 'INT4-OVER-MAX',
      gold: 100,
      description: '상한 초과',
      maxRedemptions: 2_147_483_648,
    })).toMatchObject({ status: 400, body: { error: 'bad-coupon' } });

    expect(await post({
      op: 'create',
      code: 'INT4-OVER-PER',
      gold: 100,
      description: '상한 초과',
      perAccountLimit: 2_147_483_648,
    })).toMatchObject({ status: 400, body: { error: 'bad-coupon' } });

    expect(await post({
      op: 'create',
      code: 'INT4-AT-MAX',
      gold: 100,
      description: 'int4 최댓값',
      maxRedemptions: 2_147_483_647,
      perAccountLimit: 2_147_483_647,
    })).toMatchObject({
      status: 200,
      body: {
        coupon: {
          code: 'INT4-AT-MAX',
          maxRedemptions: 2_147_483_647,
          perAccountLimit: 2_147_483_647,
        },
      },
    });

    expect(await post({ op: 'delete', code: 'INT4-AT-MAX' })).toMatchObject({
      status: 200,
      body: { deleted: true, code: 'INT4-AT-MAX' },
    });
  });
});
