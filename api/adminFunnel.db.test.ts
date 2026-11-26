// 온보딩 퍼널(?q=onboardingFunnel)과 HTTP 오류율·429 지표(?q=httpMetrics) 실제 Postgres 통합 테스트.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { database } from './_db/client.js';
import { onboardingFunnel } from './_data/adminFunnel.js';
import { flushHttpMetrics } from './_data/httpMetrics.js';
import { kstDayOf } from './_server/httpMetrics.js';
import { adminSessionHeaders, seedUser, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';

const U1 = testUid(951); // 관리자, 구글 전환 5분, 튜토리얼 4단계 완료
const U2 = testUid(952); // 일반 사용자, 구글 전환 30분, 튜토리얼 3단계, 최근 7일 이벤트 기반
const U3 = testUid(953); // 구글 전환 2시간, 튜토리얼 2단계, 10일 전 sell 이벤트(7일 창 밖)
const U4 = testUid(954); // 구글 전환 3일, 튜토리얼 1단계, 최근 7일 visit 이벤트
const U5 = testUid(955); // 구글 전환 10일, 깨진 tutorials JSONB 방어 검증
const U6 = testUid(956); // 순수 게스트(저장 상태 없음)

interface Out { status: number; body: unknown; headers: Record<string, string> }

let env: ActionEnv;

async function callAdmin(query: Record<string, string>, token: string | null = null): Promise<Out> {
  const { default: handler } = await import('./admin.js');
  const out: Out = { status: 0, body: undefined, headers: {} };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
  };
  await handler({ method: 'GET', query, headers: adminSessionHeaders(token) } as never, res as never);
  return out;
}

beforeAll(async () => {
  env = await startActionEnv();
});

afterAll(async () => {
  await env?.stop();
});

describe('관리자 온보딩 퍼널 및 HTTP 지표 실제 DB 검증', () => {
  it('빈 DB에서도 0 나눗셈 없이 온보딩 퍼널 기본 구조를 돌려준다', async () => {
    const empty = await onboardingFunnel(database().db);
    expect(empty).toEqual({
      eventsWindowDays: 7,
      conversion: {
        totalUsers: 0,
        guestUsers: 0,
        googleLinkedUsers: 0,
        conversionRate: 0,
        medianMinutes: null,
        p90Minutes: null,
        buckets: [
          { bucket: 'under_10m', count: 0, pct: 0 },
          { bucket: '10m_to_1h', count: 0, pct: 0 },
          { bucket: '1h_to_24h', count: 0, pct: 0 },
          { bucket: '1d_to_7d', count: 0, pct: 0 },
          { bucket: 'over_7d', count: 0, pct: 0 },
        ],
      },
      tutorials: {
        totalUsers: 0,
        totalWithSave: 0,
        stages: [
          { id: 'village', completed: 0, rate: 0, dropOffFromPrev: 0, stepRate: null },
          { id: 'sea', completed: 0, rate: 0, dropOffFromPrev: 0, stepRate: null },
          { id: 'bounty-quests', completed: 0, rate: 0, dropOffFromPrev: 0, stepRate: null },
          { id: 'bounty-named', completed: 0, rate: 0, dropOffFromPrev: 0, stepRate: null },
        ],
      },
      steps: [
        { id: 'first_visit', users: 0, rate: 0, stepRate: null, basis: 'lifetime' },
        { id: 'tutorial_complete', users: 0, rate: 0, stepRate: null, basis: 'lifetime' },
        { id: 'first_catch', users: 0, rate: 0, stepRate: null, basis: 'lifetime' },
        { id: 'first_sell', users: 0, rate: 0, stepRate: null, basis: 'hybrid_7d' },
        { id: 'first_harbor', users: 0, rate: 0, stepRate: null, basis: 'lifetime' },
        { id: 'first_upgrade', users: 0, rate: 0, stepRate: null, basis: 'lifetime' },
      ],
    });
  });

  it('권한 검사(401·403), 기간 검증(400), HTTP 지표 합산 upsert 및 조회를 검증한다', async () => {
    const baseMs = Date.parse('2026-10-01T00:00:00.000Z');
    const isoAfter = (minutes: number) => new Date(baseMs + minutes * 60_000).toISOString();

    await seedUser(env.client, {
      uid: U1, email: 'funnel-admin@example.test', nickname: '퍼널관리',
      state: {
        gold: 500, fame: 50, boat: 1, rod: 3,
        location: { kind: 'region', id: 'world' },
        visited: ['village', 'world'],
        tutorials: ['village', 'sea', 'bounty-quests', 'bounty-named'],
      },
    });
    await seedUser(env.client, {
      uid: U2, email: 'funnel-u2@example.test', nickname: '유저둘',
      state: {
        gold: 100, fame: 10, boat: 0, rod: 1,
        location: { kind: 'base', id: 'harbor' },
        visited: ['village'],
        tutorials: ['village', 'sea', 'bounty-quests'],
      },
    });
    await seedUser(env.client, {
      uid: U3, email: 'funnel-u3@example.test', nickname: '유저셋',
      state: {
        gold: 50, fame: 5, boat: 0, rod: 1,
        location: { kind: 'region', id: 'village' },
        visited: ['village'],
        tutorials: ['village', 'sea'],
      },
    });
    await seedUser(env.client, {
      uid: U4, email: 'funnel-u4@example.test', nickname: '유저넷',
      state: {
        gold: 0, fame: 0, boat: 0, rod: 1,
        location: { kind: 'region', id: 'village' },
        visited: ['village'],
        tutorials: ['village'],
      },
    });
    await seedUser(env.client, {
      uid: U5, email: 'funnel-u5@example.test', nickname: '유저다섯',
      state: { gold: 0, fame: 0, boat: 0, rod: 1 },
    });
    // tutorials가 배열이 아닌 깨진 저장 상태 방어 검증
    await env.client.query(
      `update public.saves_current set data = jsonb_set(data, '{tutorials}', '"corrupt"'::jsonb) where user_id = $1`,
      [U5],
    );
    await seedUser(env.client, { uid: U6, nickname: null });

    await env.client.query('insert into public.admins (user_id) values ($1)', [U1]);

    // 가입 시각 통일 후 구글 연결 시각을 5개 버킷에 하나씩 배치 (5분, 30분, 2시간, 3일, 10일)
    for (const uid of [U1, U2, U3, U4, U5, U6]) {
      await env.client.query(`update auth.users set created_at = $2 where id = $1`, [uid, isoAfter(0)]);
    }
    const links: readonly [string, number][] = [
      [U1, 5],
      [U2, 30],
      [U3, 120],
      [U4, 3 * 24 * 60],
      [U5, 10 * 24 * 60],
    ];
    for (const [uid, mins] of links) {
      await env.client.query(
        `insert into auth.accounts (user_id, account_id, provider_id, created_at, updated_at)
         values ($1, $2, 'google', $3, $3)`,
        [uid, `google-${uid}`, isoAfter(mins)],
      );
    }

    // 6단계 온보딩 신호 시드
    await env.client.query(
      `insert into public.records (user_id, fish_id, form, count) values ($1, 'crucian', 'normal', 5), ($2, 'crucian', 'normal', 1)`,
      [U1, U3],
    );
    await env.client.query(
      `insert into public.achievement_counters (user_id, key, value) values ($1, 'sell.gold', 500)`,
      [U1],
    );
    await env.client.query(
      `insert into public.bounty_accepts (user_id, zone, port, quest_id) values ($1, 'pacific', 'harbor', 'q-1')`,
      [U3],
    );
    await env.client.query(
      `insert into public.events (user_id, type, payload, created_at) values
         ($1, 'catch', '{}'::jsonb, now() - interval '1 day'),
         ($1, 'sell', '{"gold":100}'::jsonb, now() - interval '1 day'),
         ($1, 'upgradeRod', '{"cost":50}'::jsonb, now() - interval '1 day'),
         ($2, 'sell', '{"gold":50}'::jsonb, now() - interval '10 days'),
         ($3, 'visit', '{"region":"world"}'::jsonb, now() - interval '2 days')`,
      [U2, U3, U4],
    );

    // 401/403 인증·권한 확인
    expect((await callAdmin({ q: 'onboardingFunnel' })).status).toBe(401);
    expect((await callAdmin({ q: 'httpMetrics' })).status).toBe(401);
    expect((await callAdmin({ q: 'onboardingFunnel' }, userToken(U2))).status).toBe(403);
    expect((await callAdmin({ q: 'httpMetrics' }, userToken(U2))).status).toBe(403);

    // 빈 HTTP 지표 조회
    const emptyMetrics = await callAdmin({ q: 'httpMetrics' }, userToken(U1));
    expect(emptyMetrics.status).toBe(200);
    expect(emptyMetrics.body).toEqual({
      days: 30,
      scope: 'app_server',
      summary: { total: 0, status426: 0, status429: 0, status5xx: 0, rate426: 0, rate429: 0, rate5xx: 0 },
      daily: [],
      byRoute: [],
      rows: [],
    });

    // 잘못된 days 400
    expect(await callAdmin({ q: 'httpMetrics', days: '0' }, userToken(U1))).toMatchObject({ status: 400, body: { error: 'bad-days' } });
    expect(await callAdmin({ q: 'httpMetrics', days: '91' }, userToken(U1))).toMatchObject({ status: 400, body: { error: 'bad-days' } });
    expect(await callAdmin({ q: 'httpMetrics', days: 'abc' }, userToken(U1))).toMatchObject({ status: 400, body: { error: 'bad-days' } });

    // HTTP 지표 합산 upsert 검증 (같은 키 배치 내 중복 + 연속 flush 합산 + 기간 경계)
    const nowMs = Date.now();
    const today = kstDayOf(nowMs);
    const yesterday = kstDayOf(nowMs - 86_400_000);
    const oldDay = kstDayOf(nowMs - 45 * 86_400_000);

    await flushHttpMetrics(database().db, [
      { day: today, routeGroup: 'action', total: 40, status426: 1, status429: 2, status5xx: 0 },
      { day: today, routeGroup: 'action', total: 10, status426: 0, status429: 1, status5xx: 1 },
      { day: today, routeGroup: 'auth', total: 20, status426: 0, status429: 4, status5xx: 0 },
      { day: yesterday, routeGroup: 'action', total: 30, status426: 1, status429: 0, status5xx: 2 },
      { day: oldDay, routeGroup: 'web', total: 100, status426: 0, status429: 0, status5xx: 5 },
    ]);
    await flushHttpMetrics(database().db, [
      { day: today, routeGroup: 'action', total: 50, status426: 1, status429: 2, status5xx: 1 },
    ]);

    const res30 = await callAdmin({ q: 'httpMetrics' }, userToken(U1));
    expect(res30.status).toBe(200);
    expect(res30.body).toEqual({
      days: 30,
      scope: 'app_server',
      summary: {
        total: 150, status426: 3, status429: 9, status5xx: 4,
        rate426: 0.02, rate429: 0.06, rate5xx: 0.026667,
      },
      daily: [
        {
          day: yesterday, total: 30, status426: 1, status429: 0, status5xx: 2,
          rate426: 0.033333, rate429: 0, rate5xx: 0.066667,
        },
        {
          day: today, total: 120, status426: 2, status429: 9, status5xx: 2,
          rate426: 0.016667, rate429: 0.075, rate5xx: 0.016667,
        },
      ],
      byRoute: [
        {
          routeGroup: 'action', total: 130, status426: 3, status429: 5, status5xx: 4,
          rate426: 0.023077, rate429: 0.038462, rate5xx: 0.030769,
        },
        {
          routeGroup: 'auth', total: 20, status426: 0, status429: 4, status5xx: 0,
          rate426: 0, rate429: 0.2, rate5xx: 0,
        },
      ],
      rows: [
        { day: today, routeGroup: 'action', total: 100, status426: 2, status429: 5, status5xx: 2 },
        { day: today, routeGroup: 'auth', total: 20, status426: 0, status429: 4, status5xx: 0 },
        { day: yesterday, routeGroup: 'action', total: 30, status426: 1, status429: 0, status5xx: 2 },
      ],
    });

    // days=60이면 45일 전 web 행까지 포함된다
    const res60 = await callAdmin({ q: 'httpMetrics', days: '60' }, userToken(U1));
    expect(res60.status).toBe(200);
    expect((res60.body as { summary: { total: number } }).summary.total).toBe(250);

    // days=1이면 오늘(KST) 행만 포함된다
    const res1 = await callAdmin({ q: 'httpMetrics', days: '1' }, userToken(U1));
    expect(res1.status).toBe(200);
    expect((res1.body as { summary: { total: number } }).summary.total).toBe(120);

    // 온보딩 퍼널 집계 검증
    const funnelRes = await callAdmin({ q: 'onboardingFunnel' }, userToken(U1));
    expect(funnelRes.status).toBe(200);
    expect(funnelRes.body).toEqual({
      eventsWindowDays: 7,
      conversion: {
        totalUsers: 6,
        guestUsers: 1,
        googleLinkedUsers: 5,
        conversionRate: 0.8333,
        medianMinutes: 120,
        p90Minutes: 10368,
        buckets: [
          { bucket: 'under_10m', count: 1, pct: 20 },
          { bucket: '10m_to_1h', count: 1, pct: 20 },
          { bucket: '1h_to_24h', count: 1, pct: 20 },
          { bucket: '1d_to_7d', count: 1, pct: 20 },
          { bucket: 'over_7d', count: 1, pct: 20 },
        ],
      },
      tutorials: {
        totalUsers: 6,
        totalWithSave: 5,
        stages: [
          { id: 'village', completed: 4, rate: 0.6667, dropOffFromPrev: 0, stepRate: null },
          { id: 'sea', completed: 3, rate: 0.5, dropOffFromPrev: 1, stepRate: 0.75 },
          { id: 'bounty-quests', completed: 2, rate: 0.3333, dropOffFromPrev: 1, stepRate: 0.6667 },
          { id: 'bounty-named', completed: 1, rate: 0.1667, dropOffFromPrev: 1, stepRate: 0.5 },
        ],
      },
      steps: [
        { id: 'first_visit', users: 6, rate: 1, stepRate: null, basis: 'lifetime' },
        { id: 'tutorial_complete', users: 4, rate: 0.6667, stepRate: 0.6667, basis: 'lifetime' },
        { id: 'first_catch', users: 3, rate: 0.5, stepRate: 0.75, basis: 'lifetime' },
        { id: 'first_sell', users: 2, rate: 0.3333, stepRate: 0.6667, basis: 'hybrid_7d' },
        { id: 'first_harbor', users: 4, rate: 0.6667, stepRate: 2, basis: 'lifetime' },
        { id: 'first_upgrade', users: 2, rate: 0.3333, stepRate: 0.5, basis: 'lifetime' },
      ],
    });
  });
});
