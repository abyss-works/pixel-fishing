// 계정별 추첨 가중치 조정의 서버 저장·관리자 조회/초기화를 실제 Postgres에서 검사한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { adminSessionHeaders, callAction, seedUser, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';
import { createDatabase } from './_db/client.js';
import { integrityEventFragment, integrityStateFragment, resetIntegrityState } from './_data/integrity.js';
import { parseIntegrityConfig, processIntegrityInput } from '../src/game/rules/integrity.js';

const CONFIG = JSON.stringify({
  spanMax: 0.013,
  runLength: 3,
  sessionGapMs: 9_750,
  pressureStep: 1.7,
  pressureLeak: 0.7,
  midPressure: 1.1,
  highPressure: 8.4,
  midModifier: 0.7,
  highModifier: 0.4,
});

let env: ActionEnv;
let seq = 40_000;

beforeAll(async () => {
  env = await startActionEnv();
});
afterAll(async () => {
  delete process.env.DRAW_WEIGHTING_CONFIG;
  await env?.stop();
});

async function seedPlayer() {
  const uid = testUid(seq++);
  await seedUser(env.client, { uid, email: `${uid}@example.test`, state: {} });
  return uid;
}

async function manualCatch(uid: string, biteElapsed: number) {
  const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'normal', biteElapsed });
  await env.client.query('update public.saves_current set last_catch_at = null where user_id = $1', [uid]);
  return res;
}

async function integrityRow(uid: string) {
  const { rows } = await env.client.query<{ pressure: number; stage: number; samples: unknown }>(
    'select pressure, stage, samples from public.integrity_states where user_id = $1', [uid]);
  return rows[0] ?? null;
}

async function callAdmin(query: Record<string, string>, token: string | null, method = 'GET', body?: unknown) {
  const { default: handler } = await import('./admin.js');
  const out: { status: number; body: unknown } = { status: 0, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader() {},
    end() {},
  };
  await handler({ method, query, body, headers: adminSessionHeaders(token), url: '/api/admin' } as never, res as never);
  return out;
}

describe('추첨 가중치 서버 저장', () => {
  it('설정이 없으면 상태와 이력을 남기지 않는다', async () => {
    delete process.env.DRAW_WEIGHTING_CONFIG;
    const uid = await seedPlayer();
    expect((await manualCatch(uid, 700)).status).toBe(200);
    expect(await integrityRow(uid)).toBeNull();
  });

  it('좁은 수동 입력 창이 기준에 닿으면 상태와 입력 요약을 확정과 함께 남긴다', async () => {
    process.env.DRAW_WEIGHTING_CONFIG = CONFIG;
    const uid = await seedPlayer();
    for (const biteElapsed of [700, 701, 700]) {
      expect((await manualCatch(uid, biteElapsed)).status).toBe(200);
    }
    const row = await integrityRow(uid);
    expect(row).toMatchObject({ pressure: 1.7, stage: 1 });
    expect(Array.isArray(row?.samples)).toBe(true);
    const { rows } = await env.client.query<{ detector: string; signal: { span: number; positions: number[] } }>(
      'select detector, signal from public.integrity_events where user_id = $1', [uid]);
    expect(rows).toHaveLength(1);
    expect(rows[0].detector).toBe('window-a');
    expect(rows[0].signal.positions).toHaveLength(3);
    expect(rows[0].signal.span).toBeGreaterThan(0);

    const catchRows = await env.client.query<{ weighting: number | null }>(
      "select weighting from public.events where user_id = $1 and type = 'catch' order by id", [uid]);
    expect(catchRows.rows.map(r => Number(r.weighting))).toEqual([1, 1, 0.7]);
  });

  it('점진 감소로 단계가 내려가면 그 이력을 남긴다', async () => {
    process.env.DRAW_WEIGHTING_CONFIG = CONFIG;
    const uid = await seedPlayer();
    for (const biteElapsed of [700, 701, 700]) {
      expect((await manualCatch(uid, biteElapsed)).status).toBe(200);
    }
    expect((await callAction(userToken(uid), { type: 'setAutoLockOnCatch', on: true })).status).toBe(200);

    expect(await integrityRow(uid)).toMatchObject({ pressure: 1, stage: 0, samples: [] });
    const { rows } = await env.client.query<{
      detector: string; signal: { kind?: string }; stage_before: number; stage_after: number;
    }>('select detector, signal, stage_before, stage_after from public.integrity_events where user_id = $1 order by id', [uid]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      detector: 'decay', signal: { kind: 'leak' }, stage_before: 1, stage_after: 0,
    });
  });


  it('평가 뒤 관리자 초기화가 끼어들면 늦게 확정되는 쓰기가 초기화 상태를 덮지 않는다', async () => {
    process.env.DRAW_WEIGHTING_CONFIG = CONFIG;
    const uid = await seedPlayer();
    const samples = [{ pos: 0.5, at: 1_000 }, { pos: 0.501, at: 2_000 }];
    await env.client.query(
      'insert into public.integrity_states (user_id, pressure, stage, samples) values ($1, 0, 0, $2::jsonb)',
      [uid, JSON.stringify(samples)]);
    const config = parseIntegrityConfig(CONFIG);
    if (!config) throw new Error('config expected');
    const evaluation = processIntegrityInput(
      { pressure: 0, samples },
      { kind: 'sample', pos: 0.502, at: 3_000 },
      config,
    );
    expect(evaluation.triggered).toBe(true);

    const conn = createDatabase({ connectionString: env.db.url, max: 1 });
    try {
      await resetIntegrityState(conn.db, uid, new Date().toISOString());
      await conn.db.execute(integrityStateFragment(sql`true`, uid, evaluation, new Date().toISOString()));
      const eventFragment = integrityEventFragment(sql`true`, uid, evaluation, new Date().toISOString());
      if (eventFragment) await conn.db.execute(eventFragment);
    } finally {
      await conn.pool.end();
    }

    expect(await integrityRow(uid)).toMatchObject({ pressure: 0, stage: 0, samples: [] });
    const { rows } = await env.client.query('select id from public.integrity_events where user_id = $1', [uid]);
    expect(rows).toHaveLength(0);
  });

  it('break 입력은 연속 창을 끊고 판정을 막는다', async () => {
    process.env.DRAW_WEIGHTING_CONFIG = CONFIG;
    const uid = await seedPlayer();
    expect((await manualCatch(uid, 700)).status).toBe(200);
    expect((await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'auto' })).status).toBe(200);
    await env.client.query('update public.saves_current set last_catch_at = null where user_id = $1', [uid]);
    for (const biteElapsed of [701, 700]) expect((await manualCatch(uid, biteElapsed)).status).toBe(200);
    const { rows } = await env.client.query('select id from public.integrity_events where user_id = $1', [uid]);
    expect(rows).toHaveLength(0);
  });
});

describe('추첨 가중치 관리자 조회와 초기화', () => {
  it('구간·이력·검증 지표를 읽고 초기화는 즉시 상태를 되돌리며 감사 로그를 남긴다', async () => {
    process.env.DRAW_WEIGHTING_CONFIG = CONFIG;
    const admin = testUid(seq++);
    const uid = await seedPlayer();
    await seedUser(env.client, { uid: admin, email: `admin-${seq}@example.test`, admin: true, state: {} });
    for (const biteElapsed of [700, 701, 700]) expect((await manualCatch(uid, biteElapsed)).status).toBe(200);

    const stages = await callAdmin({ q: 'integrityStages' }, userToken(admin));
    expect(stages.status).toBe(200);
    expect(JSON.stringify(stages.body)).toContain(uid);

    const events = await callAdmin({ q: 'integrityEvents', user: uid }, userToken(admin));
    expect(events.status).toBe(200);
    expect((events.body as unknown[]).length).toBe(1);

    const metrics = await callAdmin({ q: 'integrityMetrics', days: '7' }, userToken(admin));
    expect(metrics.status).toBe(200);
    expect(metrics.body).toMatchObject({ days: 7, clean: expect.any(Object), pressured: expect.any(Object) });

    const beforeTotal = (metrics.body as { pressured: { total: number } }).pressured.total;
    await env.client.query(
      "insert into public.events (user_id, type, payload, weighting) values ($1, 'catch', $2::jsonb, 0.4)",
      [admin, JSON.stringify({ fishId: 'carp', spot: 'pond' })]);
    const pastWeighted = await callAdmin({ q: 'integrityMetrics', days: '7' }, userToken(admin));
    expect((pastWeighted.body as { pressured: { total: number } }).pressured.total).toBe(beforeTotal + 1);

    const released = await callAdmin({ q: 'integrityRelease' }, userToken(admin), 'POST', { userId: uid });
    expect(released).toMatchObject({ status: 200, body: { released: true } });
    expect(await integrityRow(uid)).toMatchObject({ pressure: 0, stage: 0, samples: [] });
    const { rows } = await env.client.query<{ action: string; target_id: string }>(
      'select action, target_id from public.admin_audit_logs where target_id = $1', [uid]);
    expect(rows.some(r => r.action === 'integrityRelease')).toBe(true);
  });
});
