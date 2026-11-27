// 계정별 추첨 보정의 서버 저장·관리자 조회/해제를 실제 Postgres에서 검사한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { adminSessionHeaders, callAction, seedUser, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';
import { createDatabase } from './_db/client.js';
import { integrityEventFragment, integrityStateFragment, resetIntegrityState } from './_data/integrity.js';
import { parseIntegrityConfig, processIntegrityInput } from '../src/game/rules/integrity.js';

const CONFIG = JSON.stringify({
  spanMax: 0.01,
  runLength: 3,
  sessionGapMs: 10_000,
  pressureStep: 2,
  pressureLeak: 0.2,
  midPressure: 1,
  highPressure: 10,
  midModifier: 0.5,
  highModifier: 0.25,
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

describe('추첨 보정 서버 저장', () => {
  it('설정이 없으면 상태와 근거를 남기지 않는다', async () => {
    delete process.env.DRAW_WEIGHTING_CONFIG;
    const uid = await seedPlayer();
    expect((await manualCatch(uid, 700)).status).toBe(200);
    expect(await integrityRow(uid)).toBeNull();
  });

  it('좁은 수동 입력 창이 기준에 닿으면 압력과 원시 신호를 확정과 함께 남긴다', async () => {
    process.env.DRAW_WEIGHTING_CONFIG = CONFIG;
    const uid = await seedPlayer();
    for (const biteElapsed of [700, 701, 700]) {
      expect((await manualCatch(uid, biteElapsed)).status).toBe(200);
    }
    const row = await integrityRow(uid);
    expect(row).toMatchObject({ pressure: 2, stage: 1 });
    expect(Array.isArray(row?.samples)).toBe(true);
    const { rows } = await env.client.query<{ detector: string; signal: { span: number; positions: number[] } }>(
      'select detector, signal from public.integrity_events where user_id = $1', [uid]);
    expect(rows).toHaveLength(1);
    expect(rows[0].detector).toBe('input-window');
    expect(rows[0].signal.positions).toHaveLength(3);
    expect(rows[0].signal.span).toBeGreaterThan(0);
  });


  it('평가 뒤 관리자 해제가 끼어들면 늦게 확정되는 쓰기가 해제 상태를 덮지 않는다', async () => {
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

  it('auto 캐치는 연속을 끊고 발동을 막는다', async () => {
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

describe('추첨 보정 관리자 조회와 해제', () => {
  it('구간·이력·검증 지표를 읽고 해제는 즉시 상태를 초기화하며 감사 로그를 남긴다', async () => {
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

    const released = await callAdmin({ q: 'integrityRelease' }, userToken(admin), 'POST', { userId: uid });
    expect(released).toMatchObject({ status: 200, body: { released: true } });
    expect(await integrityRow(uid)).toMatchObject({ pressure: 0, stage: 0, samples: [] });
    const { rows } = await env.client.query<{ action: string; target_id: string }>(
      'select action, target_id from public.admin_audit_logs where target_id = $1', [uid]);
    expect(rows.some(r => r.action === 'integrityRelease')).toBe(true);
  });
});
