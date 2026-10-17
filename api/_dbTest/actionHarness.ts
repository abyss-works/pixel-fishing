// 액션 엔드포인트 특성 테스트 하네스 — 요청 처리 함수를 실제 Postgres에 연결해 호출하고,
// 응답과 사용자별 DB 상태를 정규화해 비교할 수 있게 한다.
// 전환 전 구현은 supabase-js(PostgREST)로, 전환 뒤 구현은 DATABASE_URL로 같은 데이터베이스에 닿는다.
import { createHmac, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import { inject } from 'vitest';
import type { FishInstance, GameState } from '../../src/game/rules/logic.js';
import { newState } from '../../src/game/rules/logic.js';
import { AUTHENTICATOR_PASSWORD, DB_NETWORK_ALIAS } from './config.js';
import { createTestDatabase } from './testDatabase.js';
import type { TestDatabase } from './testDatabase.js';

export const POSTGREST_IMAGE = 'postgrest/postgrest:v13.0.5';
const JWT_SECRET = 'test-only-jwt-secret-0123456789abcdef0123456789';

function sign(payload: Record<string, unknown>): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const head = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}`;
  return `${head}.${createHmac('sha256', JWT_SECRET).update(head).digest('base64url')}`;
}

/** 사용자 세션 토큰. 만료는 현재(가짜) 시각 기준 1시간 뒤다 */
export function userToken(uid: string, email: string | null = null): string {
  return sign({ sub: uid, role: 'authenticated', email, exp: Math.floor(Date.now() / 1000) + 3600 });
}

export interface ActionEnv {
  db: TestDatabase;
  client: Client;
  stop(): Promise<void>;
}

/** 테스트 데이터베이스, 그 위의 PostgREST, 요청 처리 함수가 읽는 환경 변수를 준비한다 */
export async function startActionEnv(): Promise<ActionEnv> {
  const db = await createTestDatabase();
  const dbName = new URL(db.url).pathname.slice(1);
  const postgrest: StartedTestContainer = await new GenericContainer(POSTGREST_IMAGE)
    .withNetworkMode(inject('dbNetwork'))
    .withEnvironment({
      PGRST_DB_URI: `postgres://authenticator:${AUTHENTICATOR_PASSWORD}@${DB_NETWORK_ALIAS}:5432/${dbName}`,
      PGRST_DB_SCHEMAS: 'public',
      PGRST_DB_ANON_ROLE: 'anon',
      PGRST_JWT_SECRET: JWT_SECRET,
    })
    .withExposedPorts(3000)
    .withWaitStrategy(Wait.forHttp('/', 3000))
    .withStartupTimeout(120_000)
    .start();

  process.env.VITE_SUPABASE_URL = `http://${postgrest.getHost()}:${postgrest.getMappedPort(3000)}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = sign({ role: 'service_role', exp: 4_102_444_800 });
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.DATABASE_URL = db.url;
  delete process.env.VERCEL_ENV;
  delete process.env.SENTRY_DSN;

  const client = new Client({ connectionString: db.url });
  await client.connect();
  return {
    db, client,
    stop: async () => {
      await client.end();
      await postgrest.stop();
      await db.drop();
    },
  };
}

export interface ActionResponse { status: number; body: unknown }

/** 요청 처리 함수를 한 번 호출한다. 배포 식별자는 테스트 프로세스의 기본값('dev')이다 */
export async function callAction(token: string | null, body: unknown, opts: {
  method?: string; origin?: string; buildId?: string;
} = {}): Promise<ActionResponse> {
  const { default: handler } = await import('../action.js');
  const headers: Record<string, string> = { 'x-build-id': opts.buildId ?? 'dev' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (opts.origin) headers.origin = opts.origin;
  const out: ActionResponse = { status: 0, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    end() {},
  };
  await handler({ method: opts.method ?? 'POST', headers, body } as never, res as never);
  return out;
}

/** 로컬 오리진 — 개발 명령과 강제 조우가 열린다 */
export const LOCAL_ORIGIN = 'http://localhost:5199';

export interface SeedOptions {
  /** 고정 uid — 일일 의뢰 배정처럼 uid에 따라 결과가 갈리는 경로를 결정적으로 만든다 */
  uid?: string;
  email?: string | null;
  nickname?: string | null;
  /** 저장 상태. 없으면 saves_current 행을 만들지 않는다(첫 액션 시딩 경로) */
  state?: Partial<GameState>;
  version?: number;
  updatedAt?: string;
  restricted?: boolean;
}

/** 사용자와 그 저장 상태를 표에 직접 만든다. 저장 형식은 서버의 stateRow·instRow와 같다 */
export async function seedUser(client: Client, opts: SeedOptions = {}): Promise<string> {
  const uid = opts.uid ?? randomUUID();
  await client.query('insert into auth.users (id, email, is_anonymous) values ($1, $2, $3)',
    [uid, opts.email ?? null, !opts.email]);
  if (opts.nickname !== null) {
    await client.query('insert into public.profiles (user_id, nickname) values ($1, $2)',
      [uid, opts.nickname ?? `user-${uid.slice(-8)}`]);
  }
  if (opts.state) {
    const state: GameState = { ...newState(), ...opts.state };
    const { bag, exhibit, dex, gold, fame, boat, rod, ...rest } = state;
    await client.query(
      `insert into public.saves_current (user_id, data, gold, fame, boat, rod, version, updated_at, restricted)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [uid, rest, gold, fame, boat, rod, opts.version ?? 2, opts.updatedAt ?? '2026-01-01T00:00:00.000Z', opts.restricted ?? false]);
    const inst = (i: FishInstance, slot: number | null) => client.query(
      `insert into public.fish_instances (uid, user_id, fish_id, form, size, caught_at, spot, judgment, slot, locked)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [i.uid, uid, i.fishId, i.form, i.size, i.caughtAt, i.spot, i.judgment, slot, i.locked]);
    for (const i of bag) await inst(i, null);
    for (const [slot, i] of exhibit.entries()) if (i) await inst(i, slot);
    for (const [fishId, forms] of Object.entries(dex)) {
      for (const [form, rec] of Object.entries(forms)) {
        if (!rec) continue;
        await client.query(
          `insert into public.records (user_id, fish_id, form, count, max_size, first_caught) values ($1, $2, $3, $4, $5, $6)`,
          [uid, fishId, form, rec.count, rec.maxSize, rec.first]);
      }
    }
  }
  return uid;
}

/** 시험용 개체 */
export function fish(fishId: string, over: Partial<FishInstance> = {}): FishInstance {
  return {
    uid: randomUUID(), fishId, form: 'normal', size: 30, caughtAt: '2026-01-01T00:00:00.000Z',
    spot: 'pond', judgment: 'good', locked: false, ...over,
  };
}

// ---------- 정규화 ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * 비교용 정규화. 무작위 UUID는 자리표시로, 시각은 가짜 현재 시각이면 <now>,
 * 데이터베이스 now()로 찍힌 실제 시각이면 <db-now>, 그 밖에는 UTC ISO 문자열로 바꾼다.
 */
export function normalize(value: unknown, uid: string): unknown {
  if (value instanceof Date) return time(value);
  if (typeof value === 'string') {
    if (value === uid) return '<user>';
    if (UUID.test(value)) return '<uuid>';
    if (ISO.test(value)) return time(new Date(value));
    return value;
  }
  if (Array.isArray(value)) return value.map(v => normalize(v, uid));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v, uid)]));
  }
  return value;
}

function time(d: Date): string {
  if (d.getTime() === Date.now()) return '<now>';
  // 가짜 시각은 실제 시각과 수년 떨어져 있어 실제 시각 근처면 데이터베이스가 찍은 값이다
  if (Math.abs(d.getTime() - realNow()) < 10 * 60_000) return '<db-now>';
  return d.toISOString();
}

let realNowFn: () => number = () => Date.now();
/** 가짜 시계를 켜기 전에 실제 시계를 붙잡아 둔다 */
export function captureRealClock(fn: () => number): void { realNowFn = fn; }
const realNow = () => realNowFn();

/** 사용자 행을 가진 표. id(식별 열 순번)는 쓰기 순서에 따라 달라지므로 비교에서 뺀다 */
const USER_TABLES: Record<string, string> = {
  saves_current: 'user_id', fish_instances: 'user_id', records: 'user_id', saves: 'user_id',
  profiles: 'user_id', events: 'user_id', letters: 'user_id',
  bounty_licenses: 'user_id', bounty_accepts: 'user_id', bounty_progress: 'user_id', bounty_tickets: 'user_id',
  reliefs: 'claimed_by',
};

/** 사용자의 모든 행을 표별로 정규화해 정렬된 목록으로 돌려준다 */
export async function dumpUser(client: Client, uid: string): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const [table, col] of Object.entries(USER_TABLES)) {
    const { rows } = await client.query(`select * from public.${table} where ${col} = $1`, [uid]);
    out[table] = rows
      .map(r => { const { id: _id, ...rest } = r as Record<string, unknown>; return normalize(rest, uid); })
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return out;
}

/** 결정적 난수(mulberry32) — Math.random 대역 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** 테스트 번호로 만든 고정 uid */
export function testUid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}
