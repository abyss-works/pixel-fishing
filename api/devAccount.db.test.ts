// 개발 도구 전용 계정 승격·초기화 엔드포인트 실제 Postgres 검증.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newState } from '../src/game/rules/logic.js';
import { database } from './_db/client.js';
import { readOwnState } from './_data/me.js';
import { adminSessionHeaders, fish, seedUser, sessionHeaders, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';

const ORIGIN = 'http://localhost:3000';
let env: ActionEnv;
let nextUid = 1200;

beforeAll(async () => {
  env = await startActionEnv();
});
afterAll(async () => {
  await env?.stop();
});
beforeEach(() => {
  process.env.DEPLOY_ENV = 'local';
});

function mergeCookies(existing: string, setCookies: string[]): string {
  const jar = new Map<string, string>();
  for (const part of existing.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) jar.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  for (const sc of setCookies) {
    const first = sc.split(';')[0].trim();
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    const k = first.slice(0, eq);
    const v = first.slice(eq + 1);
    if (!v) jar.delete(k);
    else jar.set(k, v);
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function callDev(
  path: '/api/dev/promote-test' | '/api/dev/reset-account',
  opts: { method?: string; cookie?: string; token?: string | null; adminToken?: string | null } = {},
): Promise<{ status: number; body: unknown; setCookies: string[] }> {
  const { default: handler } = await import('./devAccount.js');
  const out: { status: number; body: unknown; setCookies: string[] } = { status: 0, body: undefined, setCookies: [] };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader(k: string, v: string | string[]) {
      if (k.toLowerCase() === 'set-cookie') {
        out.setCookies.push(...(Array.isArray(v) ? v : [v]));
      }
    },
  };
  const cookieParts = [
    opts.cookie ?? '',
    opts.token !== undefined ? (sessionHeaders(opts.token).cookie ?? '') : '',
    opts.adminToken !== undefined ? (adminSessionHeaders(opts.adminToken).cookie ?? '') : '',
  ].filter(Boolean);
  await handler({
    method: opts.method ?? 'POST',
    url: path,
    headers: cookieParts.length > 0 ? { cookie: cookieParts.join('; ') } : {},
  } as never, res as never);
  return out;
}

describe('개발 도구 계정 승격·초기화 환경·권한 차단', () => {
  it('production, 미설정, 모르는 DEPLOY_ENV에서는 관리자 쿠키가 있어도 항상 404를 반환한다', async () => {
    const adminUid = await seedUser(env.client, { uid: testUid(nextUid++), email: 'dev-admin1@example.test', admin: true });
    for (const deployEnv of ['production', undefined, '', 'development']) {
      if (deployEnv === undefined) delete process.env.DEPLOY_ENV;
      else process.env.DEPLOY_ENV = deployEnv;

      for (const path of ['/api/dev/promote-test', '/api/dev/reset-account'] as const) {
        const res = await callDev(path, { token: userToken(adminUid), adminToken: userToken(adminUid) });
        expect(res.status, `${String(deployEnv)} ${path}`).toBe(404);
      }
    }
  });

  it('preview에서는 관리자 OAuth 쿠키·명부가 없으면 거부(403)하고, 게임 세션이 없으면 401이다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    const adminUid = await seedUser(env.client, { uid: testUid(nextUid++), email: 'dev-admin2@example.test', admin: true });
    const memberUid = await seedUser(env.client, { uid: testUid(nextUid++), email: 'dev-member2@example.test' });
    const guestUid = await seedUser(env.client, { uid: testUid(nextUid++) });

    for (const path of ['/api/dev/promote-test', '/api/dev/reset-account'] as const) {
      expect((await callDev(path, { token: userToken(guestUid) })).status).toBe(403);
      expect((await callDev(path, { token: userToken(guestUid), adminToken: userToken(memberUid) })).status).toBe(403);
      expect((await callDev(path, { adminToken: userToken(adminUid) })).status).toBe(401);
    }
  });
});

describe('POST /api/dev/promote-test', () => {
  it('게스트 세이브를 보존한 채 테스트 정식 계정으로 승격하고, cookieCache를 갱신해 get-session이 즉시 비게스트를 돌려준다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    const adminUid = await seedUser(env.client, { uid: testUid(nextUid++), email: 'dev-admin3@example.test', admin: true });
    const { appAuth } = await import('./_auth/session.js');
    const auth = appAuth();

    // 1. 실제 익명 로그인으로 session_token과 session_data(cookieCache) 쿠키 발급
    const anonRes = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/anonymous`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }));
    expect(anonRes.status).toBe(200);
    const anonJson = await anonRes.json() as { user: { id: string } };
    const guestUid = anonJson.user.id;
    let gameCookie = mergeCookies('', anonRes.headers.getSetCookie());

    // 2. 게스트 세이브 시딩
    const bagFish = fish('crucian', { size: 35 });
    const seededState = {
      ...newState(),
      gold: 4321,
      fame: 88,
      boat: 1,
      rod: 3,
      fortune: { day: '2026-11-25', kind: 'gold' as const, index: 5 as const },
    };
    const { bag: _b, exhibit: _e, dex: _d, gold, fame, boat, rod, achievementCounters: _ac, clearedNamed: _cn, ...rest } = seededState;
    await env.client.query(
      `insert into public.saves_current (user_id, data, gold, fame, boat, rod, version) values ($1, $2, $3, $4, $5, $6, 4)`,
      [guestUid, rest, gold, fame, boat, rod],
    );
    await env.client.query(
      `insert into public.fish_instances (uid, user_id, fish_id, form, size, caught_at, spot, judgment, slot, locked)
       values ($1, $2, $3, $4, $5, $6, $7, $8, null, false)`,
      [bagFish.uid, guestUid, bagFish.fishId, bagFish.form, bagFish.size, bagFish.caughtAt, bagFish.spot, bagFish.judgment],
    );

    // 3. 승격 직전 /api/auth/get-session은 캐시에서 isAnonymous: true를 돌려줌
    const beforeSessRes = await auth.handler(new Request(`${ORIGIN}/api/auth/get-session`, {
      method: 'GET',
      headers: { origin: ORIGIN, cookie: gameCookie },
    }));
    const beforeSess = await beforeSessRes.json() as { user: { isAnonymous: boolean; email: string } };
    expect(beforeSess.user.isAnonymous).toBe(true);

    // 4. promote-test 호출
    const res = await callDev('/api/dev/promote-test', {
      cookie: gameCookie,
      adminToken: userToken(adminUid),
    });
    const expectedEmail = `test-${guestUid.slice(0, 8)}@stage.invalid`;
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, email: expectedEmail, isAnonymous: false });
    expect(res.setCookies.length).toBeGreaterThan(0);

    // 5. DB auth.users 갱신 및 세이브 보존 확인
    const userRow = (await env.client.query<{ is_anonymous: boolean; email: string; email_verified: boolean }>(
      `select is_anonymous, email, email_verified from auth.users where id = $1`,
      [guestUid],
    )).rows[0];
    expect(userRow).toEqual({ is_anonymous: false, email: expectedEmail, email_verified: true });

    const { db } = database();
    const state = await readOwnState(db, guestUid);
    expect(Number(state.cur?.gold)).toBe(4321);
    expect(Number(state.cur?.fame)).toBe(88);
    expect(state.instances.map(i => i.uid)).toEqual([bagFish.uid]);

    // 6. 갱신된 쿠키로 disableCookieCache 없이 /api/auth/get-session 호출 시 즉시 비게스트 인식
    gameCookie = mergeCookies(gameCookie, res.setCookies);
    const afterSessRes = await auth.handler(new Request(`${ORIGIN}/api/auth/get-session`, {
      method: 'GET',
      headers: { origin: ORIGIN, cookie: gameCookie },
    }));
    const afterSess = await afterSessRes.json() as { user: { isAnonymous: boolean; email: string; emailVerified: boolean } };
    expect(afterSess.user.isAnonymous).toBe(false);
    expect(afterSess.user.email).toBe(expectedEmail);
    expect(afterSess.user.emailVerified).toBe(true);
  });

  it('실제 이메일이 연결된 정식 계정은 덮어쓰지 않고 409로 거부한다', async () => {
    process.env.DEPLOY_ENV = 'local';
    const memberUid = await seedUser(env.client, { uid: testUid(nextUid++), email: 'real-user@gmail.test' });
    const res = await callDev('/api/dev/promote-test', { token: userToken(memberUid) });
    expect(res.status).toBe(409);
    const row = (await env.client.query<{ email: string }>(`select email from auth.users where id = $1`, [memberUid])).rows[0];
    expect(row.email).toBe('real-user@gmail.test');
  });
});

describe('POST /api/dev/reset-account', () => {
  it('단일 트랜잭션으로 saves_current를 초기 상태(fortune: null)로 덮어쓰고 8개 연관 표의 본인 행만 지운다', async () => {
    process.env.DEPLOY_ENV = 'local';
    const target = await seedUser(env.client, {
      uid: testUid(nextUid++),
      email: 'reset-me@stage.invalid',
      state: {
        gold: 99999,
        fame: 5555,
        boat: 4,
        rod: 20,
        bag: [fish('crucian')],
        dex: { crucian: { normal: { count: 3, maxSize: 30, first: '2026-01-01' } } },
        coupons: ['WELCOME'],
        fortune: { day: '2026-11-25', kind: 'fish', index: 3 },
      },
      version: 7,
      lastCatchAt: '2026-11-25T00:00:00.000Z',
      activeClient: '11111111-1111-4111-8111-111111111111',
    });
    const other = await seedUser(env.client, {
      uid: testUid(nextUid++),
      email: 'keep-other@stage.invalid',
      state: { gold: 777, bag: [fish('carp')], dex: { carp: { normal: { count: 1, maxSize: 20, first: '2026-01-01' } } } },
    });

    for (const uid of [target, other]) {
      await env.client.query(`insert into public.bounty_clears (user_id, kind, quest_id) values ($1, 'named', 'pacific-named-megalodon')`, [uid]);
      await env.client.query(`insert into public.bounty_progress (user_id, zone, quest_id, progress) values ($1, 'pacific', 'pacific-easy-common', 2)`, [uid]);
      await env.client.query(`insert into public.bounty_tickets (user_id, quest_id) values ($1, 'pacific-named-megalodon')`, [uid]);
      await env.client.query(`insert into public.bounty_accepts (user_id, zone, port, quest_id) values ($1, 'pacific', 'harbor', 'pacific-easy-common')`, [uid]);
      await env.client.query(`insert into public.bounty_licenses (user_id, zone) values ($1, 'pacific')`, [uid]);
      await env.client.query(`insert into public.achievement_counters (user_id, key, value) values ($1, 'sell.gold', 500)`, [uid]);
    }

    const res = await callDev('/api/dev/reset-account', { token: userToken(target) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ state: newState(), version: 8 });

    const { db } = database();
    const targetState = await readOwnState(db, target);
    expect(Number(targetState.cur?.gold)).toBe(0);
    expect(Number(targetState.cur?.fame)).toBe(0);
    expect(targetState.cur?.boat).toBe(0);
    expect(targetState.cur?.rod).toBe(1);
    expect(targetState.cur?.version).toBe(8);
    expect((targetState.cur?.data as { fortune?: unknown } | undefined)?.fortune).toBeNull();
    expect(targetState.instances).toEqual([]);
    expect(targetState.records).toEqual([]);
    expect(targetState.counters).toEqual({});
    expect(targetState.clearedNamed).toEqual([]);

    const saveMeta = (await env.client.query<{ last_catch_at: unknown; active_client: unknown }>(
      `select last_catch_at, active_client from public.saves_current where user_id = $1`,
      [target],
    )).rows[0];
    expect(saveMeta).toEqual({ last_catch_at: null, active_client: null });

    for (const table of [
      'fish_instances', 'records', 'bounty_clears', 'bounty_progress',
      'bounty_tickets', 'bounty_accepts', 'bounty_licenses', 'achievement_counters',
    ]) {
      const targetCnt = (await env.client.query(`select count(*)::int as c from public.${table} where user_id = $1`, [target])).rows[0].c;
      const otherCnt = (await env.client.query(`select count(*)::int as c from public.${table} where user_id = $1`, [other])).rows[0].c;
      expect(targetCnt, `target ${table}`).toBe(0);
      expect(otherCnt, `other ${table}`).toBe(1);
    }
  });
});

describe('스테이징 진입 게이트 DB 판정', () => {
  it('verifyStageAdmin과 checkStageLiveUpgrade는 preview에서 실제 관리자 세션 쿠키와 admins 명부를 검사한다', async () => {
    const { verifyStageAdmin, checkStageLiveUpgrade } = await import('./_server/stageGate.js');
    const adminUid = await seedUser(env.client, { uid: testUid(nextUid++), email: 'gate-admin@example.test', admin: true });
    const maintUid = await seedUser(env.client, { uid: testUid(nextUid++), email: 'gate-maint@example.test' });
    await env.client.query(`insert into public.admins (user_id, role) values ($1, 'maintainer')`, [maintUid]);
    const memberUid = await seedUser(env.client, { uid: testUid(nextUid++), email: 'gate-member@example.test' });

    process.env.DEPLOY_ENV = 'preview';
    expect(await verifyStageAdmin({})).toEqual({ ok: false, status: 401 });
    expect(await verifyStageAdmin(sessionHeaders(userToken(adminUid)))).toEqual({ ok: false, status: 401 });
    expect(await verifyStageAdmin(adminSessionHeaders(userToken(memberUid)))).toEqual({ ok: false, status: 403 });
    expect(await verifyStageAdmin(adminSessionHeaders(userToken(adminUid)))).toEqual({ ok: true, uid: adminUid });
    expect(await verifyStageAdmin(adminSessionHeaders(userToken(maintUid)))).toEqual({ ok: true, uid: maintUid });

    expect(await checkStageLiveUpgrade({ headers: {} } as never)).toBe(401);
    expect(await checkStageLiveUpgrade({ headers: adminSessionHeaders(userToken(memberUid)) } as never)).toBe(403);
    expect(await checkStageLiveUpgrade({ headers: adminSessionHeaders(userToken(adminUid)) } as never)).toBeNull();
    expect(await checkStageLiveUpgrade({ headers: adminSessionHeaders(userToken(maintUid)) } as never)).toBeNull();

    // preview에서 maintainer도 devAccount 도구를 호출할 수 있고, production에서는 모두 차단된다
    const targetGuest = await seedUser(env.client, { uid: testUid(nextUid++), nickname: '게스트' });
    const maintPromote = await callDev('/api/dev/promote-test', {
      token: userToken(targetGuest),
      adminToken: userToken(maintUid),
    });
    expect(maintPromote).toMatchObject({ status: 200, body: { ok: true, isAnonymous: false } });

    process.env.DEPLOY_ENV = 'production';
    expect(await callDev('/api/dev/promote-test', {
      token: userToken(targetGuest),
      adminToken: userToken(maintUid),
    })).toMatchObject({ status: 404, body: { error: 'not-found' } });
  });

  it('STAGE_ALLOWED_EMAILS 일반 테스터는 verifyStageAdmin·checkStageLiveUpgrade를 통과하지만 devAccount 도구는 403으로 차단된다', async () => {
    const { verifyStageAdmin, checkStageLiveUpgrade } = await import('./_server/stageGate.js');
    const testerUid = await seedUser(env.client, { uid: testUid(nextUid++), email: 'stage-tester@example.test' });
    const otherUid = await seedUser(env.client, { uid: testUid(nextUid++), email: 'stage-other@example.test' });
    const targetGuest = await seedUser(env.client, { uid: testUid(nextUid++), nickname: '테스터대상게스트' });

    process.env.DEPLOY_ENV = 'preview';
    process.env.STAGE_ALLOWED_EMAILS = ' Stage-Tester@Example.TEST , qa@example.test ';
    try {
      expect(await verifyStageAdmin(adminSessionHeaders(userToken(testerUid)))).toEqual({ ok: true, uid: testerUid });
      expect(await checkStageLiveUpgrade({ headers: adminSessionHeaders(userToken(testerUid)) } as never)).toBeNull();
      expect(await verifyStageAdmin(adminSessionHeaders(userToken(otherUid)))).toEqual({ ok: false, status: 403 });

      const testerPromote = await callDev('/api/dev/promote-test', {
        token: userToken(targetGuest),
        adminToken: userToken(testerUid),
      });
      expect(testerPromote).toMatchObject({ status: 403, body: { error: 'forbidden' } });
    } finally {
      delete process.env.STAGE_ALLOWED_EMAILS;
      delete process.env.DEPLOY_ENV;
    }
  });
});
