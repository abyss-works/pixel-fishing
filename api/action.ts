// 액션 API — 모든 상태 변경의 유일한 서버 경로 (서버 권위 v0.5.0, Vercel Function, Node 런타임)
// 규칙 실행은 src/game/actions.ts(applyAction) — 클라이언트 LocalBackend와 같은 리듀서.
// 저장 모델(0005): saves_current(유저당 1행, 낙관 락) + events(append-only 정본 스트림)
// + saves(스냅샷 아카이브 — 50액션마다 append, 롤백 안전망). service role 키는 서버 전용.
//
// ⚠️ 시그니처는 Node 스타일(req, res)만 쓴다 — Web 표준 시그니처로 배포했다가 전부 500 났던
// 사고(2026-08-21) 재발 방지. default export = Node 시그니처.
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
// 확장자(.js) 필수 — Node 순수 ESM 로더가 src 모듈을 그대로 import한다 
import { migrate, newState } from '../src/game/logic.js';
import type { FishInstance, GameState } from '../src/game/logic.js';
import { applyAction, ACTION_TYPES } from '../src/game/actions.js';
import type { GameAction, StateWrites } from '../src/game/actions.js';
import { SNAPSHOT_EVERY } from '../src/game/balance.js';
import { APP_VERSION } from '../src/version.js';

// 배포 식별자 — vite가 클라 번들에 박는 값과 같은 출처(Vercel 시스템 환경변수).
// 공식 문서 확인: VERCEL_GIT_COMMIT_SHA는 빌드·런타임 양쪽에 제공된다.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';
import { reportServerIssue } from './observability.js';
import { ApiError, toApiError } from './errors.js';

// 생성된 DB 타입을 쓰지 않아 supabase-js가 테이블 행을 never로 추론한다 —
// 우리가 실제로 쓰는 연산만 최소 구조 타입으로 감싼다.
interface Q {
  insert(rows: unknown[]): PromiseLike<{ error?: unknown }>;
  upsert(rows: unknown[]): PromiseLike<{ error?: unknown }>;
  update(v: unknown): Q;
  delete(): Q;
  eq(col: string, v: unknown): Q;
  in(col: string, v: unknown[]): Q;
  then<R>(f: (r: { error?: unknown }) => R): PromiseLike<R>;
}
interface SupabaseLike { from(table: string): Q }
type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

// 액션 화이트리스트는 리듀서(GameAction 유니온)에서 파생 — 이중 목록 드리프트 없음
const ACTION_TYPE_SET = new Set<string>(ACTION_TYPES);

// 첫 조우일은 유저 체감 날짜 — 서버는 UTC라 KST(UTC+9)로 고정 계산 (친구 그룹 전원 한국)
const todayKST = (): string => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

// 세션 토큰 로컬 검증 (HS256, 레거시 JWT secret) — Auth 서버 왕복(~수백 ms, 리전 원거리면 그 이상)을
// 제거하는 레이턴시 최적화. SUPABASE_JWT_SECRET 미설정이면 기존 auth.getUser 경로로 폴백(무해 배포).
function verifyJwtLocal(token: string, secret: string): string | null {
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) return null;
  try {
    const header = JSON.parse(Buffer.from(h, 'base64url').toString());
    if (header.alg !== 'HS256') return null; // 알고리즘 고정 — alg 혼동 공격 차단
    const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

// 저장소 3분할 (0006): saves_current(스칼라+blob) · fish_instances(개체) · records(도감).
// 런타임 GameState는 통짜지만 저장은 접근 패턴별로 흩어진다.

/** GameState → saves_current 한 행. 스칼라는 컬럼, 나머지만 blob */
function stateRow(state: GameState) {
  const { bag: _b, exhibit: _e, dex: _d, gold, fame, boat, rod, ...rest } = state;
  return { gold, fame, boat, rod, data: rest };
}

/** 3소스 → GameState 조립 */
function assemble(row: StateRow, instances: InstanceRow[], records: RecordRow[]): GameState {
  const bag: FishInstance[] = [];
  const exhibit: FishInstance[] = [];
  for (const r of instances) {
    const inst: FishInstance = {
      uid: r.uid, fishId: r.fish_id, form: r.form as FishInstance['form'],
      size: r.size, caughtAt: r.caught_at, spot: r.spot as FishInstance['spot'],
      judgment: r.judgment as FishInstance['judgment'],
      locked: r.locked === true,
    };
    if (r.slot === null || r.slot === undefined) bag.push(inst);
    else exhibit[r.slot] = inst;
  }
  const dex: GameState['dex'] = {};
  for (const r of records) {
    (dex[r.fish_id] ??= {})[r.form as keyof GameState['dex'][string]] =
      { count: Number(r.count), maxSize: r.max_size, first: r.first_caught?.slice(0, 10) ?? null };
  }
  // blob에 남은 나머지(coupons·locked 등)를 얹고 migrate로 위생 처리
  return migrate({ ...(row.data as object), v: 8, gold: Number(row.gold), fame: Number(row.fame),
    boat: row.boat, rod: row.rod, bag, exhibit, dex });
}

type StateRow = { data: unknown; version: number | string; gold: number | string; fame: number | string; boat: number; rod: number };
type InstanceRow = { uid: string; fish_id: string; form: string; size: number | null; caught_at: string | null; spot: string | null; judgment: string | null; slot: number | null; locked: boolean | null };
type RecordRow = { fish_id: string; form: string; count: number | string; max_size: number | null; first_caught: string | null };

/** 개체 → DB 행 */
function instRow(uid: string, i: FishInstance, slot: number | null) {
  return {
    uid: i.uid, user_id: uid, fish_id: i.fishId, form: i.form,
    size: i.size, caught_at: i.caughtAt, spot: i.spot, judgment: i.judgment, slot,
    locked: i.locked,
  };
}

/** 시딩된 상태 전체를 "전부 새로 추가"로 표현 */
function seedWrites(seed: GameState): StateWrites {
  return {
    instancesAdded: seed.bag.map(inst => ({ inst, slot: null })),
    instancesRemoved: [],
    instancesMoved: [],
    instancesLocked: [],
    records: Object.entries(seed.dex).flatMap(([fishId, forms]) =>
      Object.entries(forms).flatMap(([form, rec]) =>
        rec ? [{ fishId, form: form as FishInstance['form'], rec }] : [])),
  };
}

// 한 번에 보낼 행 수 상한. 평상시 캐치는 1행이라 무의미하지만, **v0.4.0 이관 시딩**은
// 유저 한 명이 수천 행이 될 수 있다(구 가방은 어종 문자열 배열이라 상한이 없었다).
// 통짜로 보내면 요청 크기·타임아웃 어디서 걸리는지 알 수 없어, 애초에 쪼개 보낸다.
const INSERT_CHUNK = 500;

const chunk = <T>(xs: readonly T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

// 쓰기를 **두 등급으로 가른다.**
//   개체(fish_instances) = 상태 그 자체다. 실패하면 다음 로드에서 물고기가 사라진다 —
//     자가 치유가 없다. 그래서 **실패를 500으로 올린다.**
//   도감(records)        = 절대값 upsert라 다음 캐치가 스스로 메운다. 보고만 하고 넘어간다.
// 사고(2026-08-23): `locked` 컬럼이 없는 DB에서 개체 INSERT가 전부 실패했는데 보고만 하고
// 200을 돌려줘서, "가방이 마지막 물고기로 덮어써진다"는 증상으로만 드러났다. 관측이 꺼져
// 있으면 완전히 무음이다. 상태 손실은 조용히 넘길 수 있는 부류가 아니다.
function instanceWrites(admin: SupabaseLike, uid: string, w: StateWrites): Promise<{ error?: unknown }>[] {
  const jobs: Promise<{ error?: unknown }>[] = [];
  for (const part of chunk(w.instancesAdded, INSERT_CHUNK)) {
    jobs.push(Promise.resolve(admin.from('fish_instances')
      .insert(part.map(({ inst, slot }) => instRow(uid, inst, slot)))));
  }
  for (const part of chunk(w.instancesRemoved, INSERT_CHUNK)) {
    jobs.push(Promise.resolve(admin.from('fish_instances')
      .delete().eq('user_id', uid).in('uid', part)));
  }
  for (const m of w.instancesMoved) {
    jobs.push(Promise.resolve(admin.from('fish_instances')
      .update({ slot: m.slot }).eq('user_id', uid).eq('uid', m.uid)));
  }
  // 잠금은 true/false 두 무리뿐이라 개체 수와 무관하게 최대 두 번의 쿼리로 끝난다
  for (const locked of [true, false]) {
    const uids = w.instancesLocked.filter(l => l.locked === locked).map(l => l.uid);
    if (uids.length === 0) continue;
    jobs.push(Promise.resolve(admin.from('fish_instances')
      .update({ locked }).eq('user_id', uid).in('uid', uids)));
  }
  return jobs;
}

/** 도감 쓰기 — 실패해도 다음 캐치의 절대값 upsert가 메운다(보고만) */
function recordWrites(admin: SupabaseLike, uid: string, w: StateWrites): Promise<{ error?: unknown }>[] {
  if (w.records.length === 0) return [];
  const now = new Date().toISOString();
  // records는 종×폼이라 최대 어종수×폼수 — 쪼갤 규모가 아니다
  return [Promise.resolve(admin.from('records').upsert(w.records.map(r => ({
    user_id: uid, fish_id: r.fishId, form: r.form,
    count: r.rec.count, max_size: r.rec.maxSize, first_caught: r.rec.first, updated_at: now,
  }))))];
}

/** 개체 쓰기 실행 + 실패 시 500 — 호출자는 이 뒤로 진행하면 안 된다 */
async function writeInstances(
  admin: SupabaseLike, uid: string, w: StateWrites, action: string,
): Promise<void> {
  const results = await Promise.all(instanceWrites(admin, uid, w));
  const failures = results.filter(r => r && r.error);
  if (failures.length > 0) {
    throw new ApiError(500, 'db-write', { uid, action, kind: 'fish_instances' },
      { cause: failures[0].error });
  }
}

export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    await route(req, res);
  } catch (e) {
    const err = toApiError(e);
    if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
    res.status(err.status).json({ error: err.code, ...err.context.body as object });
  }
}

async function route(req: Req, res: Res): Promise<void> {
  // GET = 워밍/헬스 핑 (클라 캐스팅 워밍 + 업타임 모니터 대상) — 204는 브라우저 콘솔에
  // 에러로 찍히지 않는다 (405를 주면 캐스팅마다 콘솔 노이즈).
  if (req.method === 'GET') { res.status(204).end(); return; }
  if (req.method !== 'POST') throw new ApiError(405, 'method-not-allowed');

  // 낡은 탭 차단 — 클라 번들 버전이 이 함수(같은 커밋 배포)와 다르면 426 Upgrade Required.
  // 인증/리듀서보다 먼저: 새 서버의 결과를 낡은 번들이 해석 못 해 깨지는 것을 원천 차단하고,
  // 클라이언트는 업데이트 모달(새로고침 안내)을 띄운다. 헤더 부재 = 기능 도입 전 구버전 → 동일 처리.
  // 낡은 탭 차단 — **배포 단위**로 판정한다. APP_VERSION은 릴리즈 라벨이라 dev 빌드에서
  // 올라가지 않아(roadmap 0.0) 개발·스테이징 배포 사이에서는 영원히 일치했다.
  // 클라는 빌드 시 번들에 박힌 값을, 서버는 런타임 env를 읽는다 — 같은 배포면 같은 값이다.
  if (req.headers['x-build-id'] !== BUILD_ID) {
    throw new ApiError(426, 'version-mismatch', { body: { server: APP_VERSION } });
  }

  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new ApiError(500, 'server-config');

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 유저 확인 — JWT secret이 있으면 로컬 검증(왕복 0), 없으면 Auth 서버 조회 폴백
  const auth = req.headers.authorization ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  let uid: string;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (jwtSecret) {
    const sub = verifyJwtLocal(token, jwtSecret);
    if (!sub) throw new ApiError(401, 'unauthorized');
    uid = sub;
  } else {
    const { data: userData, error: authError } = await admin.auth.getUser(token);
    if (authError || !userData.user) throw new ApiError(401, 'unauthorized');
    uid = userData.user.id;
  }

  // body = GameAction (content-type: application/json이면 Vercel이 파싱해 둔다)
  let body: unknown = req.body ?? null;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const action = body as GameAction | null;
  if (!action || typeof action !== 'object' || !ACTION_TYPE_SET.has(action.type)) {
    throw new ApiError(400, 'bad-action');
  }

  // 현재 상태 로드 — 3소스를 병렬로 읽는다(서로 독립이라 왕복 1회분).
  // 행이 없으면 구 saves(아카이브) 최신 blob에서 1회 시딩 = 정규화 이관 지점.
  const SEL = 'data, version, gold, fame, boat, rod';
  const REC_SEL = 'fish_id, form, count, max_size, first_caught';
  const [curRes, instRes, recRes] = await Promise.all([
    admin.from('saves_current').select(SEL).eq('user_id', uid).maybeSingle(),
    admin.from('fish_instances').select('*').eq('user_id', uid),
    admin.from('records').select(REC_SEL).eq('user_id', uid),
  ]);

  let row = curRes.data as StateRow | null;
  let instances = (instRes.data ?? []) as unknown as InstanceRow[];
  let records = (recRes.data ?? []) as unknown as RecordRow[];
  if (!row) {
    const { data: old } = await admin.from('saves').select('data')
      .eq('user_id', uid).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    const seed = migrate(old?.data ?? newState());
    const { error: seedErr } = await admin.from('saves_current')
      .insert({ user_id: uid, version: 1, ...stateRow(seed) });
    if (seedErr) { // 동시 첫 액션 경합 — 상대가 시딩했으니 다시 읽는다
      const [againCur, againInst, againRec] = await Promise.all([
        admin.from('saves_current').select(SEL).eq('user_id', uid).maybeSingle(),
        admin.from('fish_instances').select('*').eq('user_id', uid),
        admin.from('records').select(REC_SEL).eq('user_id', uid),
      ]);
      row = againCur.data as StateRow | null;
      if (!row) throw new ApiError(500, 'db-seed', { uid }, { cause: seedErr });
      instances = (againInst.data ?? []) as unknown as InstanceRow[];
      records = (againRec.data ?? []) as unknown as RecordRow[];
    } else {
      // 시딩분의 개체·도감을 테이블로 흩어 넣는다 (blob → 정규화 이관). 실패해도 액션은 계속 —
      // saves_current는 이미 섰고, 유실분은 다음 액션의 절대값 upsert가 메운다.
      // 시딩 개체가 안 들어가면 그 유저의 가방·전시가 통째로 빈다 — 조용히 넘길 수 없다
      const sw = seedWrites(seed);
      await writeInstances(admin as unknown as SupabaseLike, uid, sw, 'seed');
      await Promise.all(recordWrites(admin as unknown as SupabaseLike, uid, sw));
      // 방금 쓴 값을 다시 읽지 않는다 — 시딩 결과가 곧 현재 상태다
      row = { data: stateRow(seed).data, version: 1,
              gold: seed.gold, fame: seed.fame, boat: seed.boat, rod: seed.rod };
      instances = seed.bag.map(i => instRow(uid, i, null));
      records = [];
    }
  }

  const state = assemble(row, instances, records);

  // 동적 쿠폰(coupons 테이블) — 쿠폰 액션일 때만 서버가 직접 조회 (active=false는 신규 사용 차단)
  let dynamicCoupon: { gold: number; desc: string } | null = null;
  if (action.type === 'redeemCoupon' && typeof action.code === 'string') {
    const { data: c } = await admin.from('coupons').select('gold, description')
      .eq('code', action.code.trim()).eq('active', true).maybeSingle();
    if (c) dynamicCoupon = { gold: c.gold, desc: c.description };
  }

  const out = applyAction(state, action, {
    rng: Math.random, today: todayKST(),
    now: new Date().toISOString(), newUid: () => crypto.randomUUID(),
    dynamicCoupon,
  });
  if (!out.ok) throw new ApiError(422, out.error); // 규칙 거부 — 정상 응답이라 보고하지 않는다

  // 낙관 락 갱신 — 읽은 version 그대로면 성공. 0행이면 다른 요청과 경합(멀티탭) → 409,
  // 클라이언트(HttpBackend)가 최신 상태 위에 1회 재시도한다.
  const nextVersion = Number(row.version) + 1;
  const { data: updated, error: updErr } = await admin.from('saves_current')
    .update({ ...stateRow(out.state), version: nextVersion, updated_at: new Date().toISOString() })
    .eq('user_id', uid).eq('version', row.version)
    .select('user_id');
  // 유저 입장에서는 "행동이 저장되지 않음" — 가장 아픈 실패. 500이라 자동 보고된다
  if (updErr) throw new ApiError(500, 'db-write', { uid, action: action.type }, { cause: updErr });
  if (!updated || updated.length === 0) throw new ApiError(409, 'version-conflict');

  // 이벤트 append + 주기 스냅샷 — 락 획득 후, 서로 독립이라 병렬 (왕복 1회 절약).
  // 실패해도 상태는 확정 — 이벤트/스냅샷만 유실, 수용.
  const followUps: Promise<unknown>[] = [];
  if (out.events.length > 0) {
    followUps.push(Promise.resolve(admin.from('events').insert(
      out.events.map(e => ({ user_id: uid, type: e.type, payload: e.payload })))));
  }
  if (nextVersion % SNAPSHOT_EVERY === 0) { // saves는 append-only 아카이브로 존속 (0003 안전망)
    followUps.push(Promise.resolve(admin.from('saves').insert(
      { user_id: uid, data: out.state, updated_at: new Date().toISOString() })));
  }
  // 개체·도감 변경분 — 리듀서가 전후 비교로 뽑아준 것을 그대로 적용한다(재계산 금지).
  // records는 절대값 upsert라 한 번 실패해도 다음 캐치가 자가 치유한다.
  // 개체 먼저 — 실패하면 여기서 500으로 끊는다(뒤의 "유실 허용" 묶음과 등급이 다르다)
  await writeInstances(admin as unknown as SupabaseLike, uid, out.writes, action.type);
  followUps.push(...recordWrites(admin as unknown as SupabaseLike, uid, out.writes));
  // 후속 쓰기 실패는 상태를 되돌리지 않는다(이벤트·기록만 유실, 수용) — 다만 **조용히**
  // 잃으면 안 된다. supabase 클라이언트는 거부하지 않고 { error }를 돌려주므로 직접 검사한다.
  if (followUps.length > 0) {
    const settled = await Promise.all(followUps) as { error?: unknown }[];
    const failures = settled.filter(r => r && r.error);
    if (failures.length > 0) {
      await reportServerIssue('후속 쓰기 실패 — events/records/스냅샷 유실',
        failures.map(f => f.error), { uid, action: action.type, version: nextVersion });
    }
  }

  res.status(200).json({ state: out.state, result: out.result });
}
