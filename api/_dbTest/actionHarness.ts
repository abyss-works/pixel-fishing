// 액션 엔드포인트 특성 테스트 하네스 — 요청 처리 함수를 실제 Postgres에 연결해 호출하고,
// 응답과 사용자별 DB 상태를 정규화해 비교할 수 있게 한다. 요청 처리 함수는 DATABASE_URL로 테스트 데이터베이스에 닿는다.
import bcrypt from 'bcryptjs';
import { createHmac, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import type { FishInstance, GameState } from '../../src/game/rules/logic.js';
import { newState } from '../../src/game/rules/logic.js';
import { APP_VERSION } from '../../src/version.js';
import { ADMIN_COOKIE_PREFIX, adminSecret } from '../_auth/auth.js';
import { pendingAfterResponse } from './serverShim.js';
import { createTestDatabase } from './testDatabase.js';
import type { TestDatabase } from './testDatabase.js';

const AUTH_SECRET = 'test-only-auth-secret-0123456789abcdef0123456789';
const SESSION_COOKIE = 'better-auth.session_token';

/** 사용자 세션 토큰. seedUser가 이 토큰의 세션을 만들어 둔다 */
export function userToken(uid: string): string {
  return `test-session-${uid}`;
}

/** 세션 토큰을 서명한 쿠키 헤더. 토큰이 없으면 빈 헤더다 */
function signedCookie(name: string, secret: string, token: string | null): Record<string, string> {
  if (!token) return {};
  const signature = createHmac('sha256', secret).update(token).digest('base64');
  return { cookie: `${name}=${encodeURIComponent(`${token}.${signature}`)}` };
}

/** 게임 세션 쿠키 헤더. 토큰이 없으면 빈 헤더다 */
export function sessionHeaders(token: string | null): Record<string, string> {
  return signedCookie(SESSION_COOKIE, AUTH_SECRET, token);
}

/** 관리자 세션 쿠키 헤더. 같은 세션 토큰을 관리자 인증의 쿠키 이름과 서명 키로 싣는다. 토큰이 없으면 빈 헤더다 */
export function adminSessionHeaders(token: string | null): Record<string, string> {
  return signedCookie(`${ADMIN_COOKIE_PREFIX}.session_token`, adminSecret(AUTH_SECRET), token);
}

export interface ActionEnv {
  db: TestDatabase;
  client: Client;
  stop(): Promise<void>;
}

/** 테스트 데이터베이스와 요청 처리 함수가 읽는 환경 변수를 준비한다. 메일 발송은 serverShim이 받는다 */
export async function startActionEnv(): Promise<ActionEnv> {
  const db = await createTestDatabase();
  process.env.BETTER_AUTH_SECRET = AUTH_SECRET;
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  process.env.RESEND_API_KEY = 'test-only-resend-key';
  process.env.MAIL_FROM = 'test <no-reply@example.test>';
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
  process.env.DATABASE_URL = db.url;
  process.env.DEPLOY_ENV = 'local';
  delete process.env.SENTRY_DSN;

  const client = new Client({ connectionString: db.url });
  await client.connect();
  return {
    db, client,
    stop: async () => {
      await client.end();
      await db.drop();
    },
  };
}

export interface ActionResponse { status: number; body: unknown }

/** 요청 처리 함수를 한 번 호출한다. 배포 식별자는 테스트 프로세스의 기본값('dev'), 버전은 현재 APP_VERSION이다 */
export async function callAction(token: string | null, body: unknown, opts: {
  method?: string; origin?: string; buildId?: string; clientId?: string;
} = {}): Promise<ActionResponse> {
  const { default: handler } = await import('../action.js');
  const headers: Record<string, string> = {
    'x-build-id': opts.buildId ?? 'dev', 'x-client-version': APP_VERSION, ...sessionHeaders(token),
  };
  if (opts.origin) headers.origin = opts.origin;
  if (opts.clientId) headers['x-client-id'] = opts.clientId;
  const out: ActionResponse = { status: 0, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    end() {},
  };
  await handler({ method: opts.method ?? 'POST', headers, body } as never, res as never);
  await Promise.all(pendingAfterResponse.splice(0));
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
  /** 직전 캐치 시각(saves_current.last_catch_at) */
  lastCatchAt?: string;
  /** 활성 창 식별자(saves_current.active_client) */
  activeClient?: string;
}

/** 사용자와 그 저장 상태를 표에 직접 만든다. 저장 형식은 서버의 stateRow·instRow와 같다 */
export async function seedUser(client: Client, opts: SeedOptions = {}): Promise<string> {
  const uid = opts.uid ?? randomUUID();
  await client.query('insert into auth.users (id, email, is_anonymous) values ($1, $2, $3)',
    [uid, opts.email ?? `${uid}@anonymous.invalid`, !opts.email]);
  await client.query(`insert into auth.sessions (user_id, token, expires_at) values ($1, $2, '2100-01-01T00:00:00Z')`,
    [uid, userToken(uid)]);
  if (opts.nickname !== null) {
    await client.query('insert into public.profiles (user_id, nickname) values ($1, $2)',
      [uid, opts.nickname ?? `user-${uid.slice(-8)}`]);
  }
  if (opts.state) {
    const state: GameState = { ...newState(), ...opts.state };
    const { bag, exhibit, dex, gold, fame, boat, rod, ...rest } = state;
    await client.query(
      `insert into public.saves_current (user_id, data, gold, fame, boat, rod, version, updated_at, restricted, last_catch_at, active_client)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [uid, rest, gold, fame, boat, rod, opts.version ?? 2, opts.updatedAt ?? '2026-01-01T00:00:00.000Z', opts.restricted ?? false,
        opts.lastCatchAt ?? null, opts.activeClient ?? null]);
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

/** 이메일과 비밀번호로 로그인하는 기존 계정을 인증 표에 직접 만든다. 구글을 연결하기 전의 이메일 계정이다 */
export async function seedPasswordAccount(client: Client, email: string, password: string, uid: string = randomUUID()): Promise<string> {
  await client.query('insert into auth.users (id, email, is_anonymous) values ($1, $2, false)', [uid, email]);
  await client.query(`insert into auth.accounts (user_id, account_id, provider_id, password) values ($1::uuid, $1::text, 'credential', $2)`,
    [uid, bcrypt.hashSync(password, 10)]);
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
  bounty_clears: 'user_id',
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
