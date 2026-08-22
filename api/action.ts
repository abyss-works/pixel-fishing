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
import type { FormRecord, GameState } from '../src/game/logic.js';
import { applyAction, ACTION_TYPES } from '../src/game/actions.js';
import type { ActionResult, GameAction } from '../src/game/actions.js';
import { SNAPSHOT_EVERY } from '../src/game/balance.js';
import { APP_VERSION } from '../src/version.js';
import { reportServerIssue } from './observability.js';
import { ApiError, toApiError } from './errors.js';

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

// records(0006) 행 생성 — catch는 갱신된 종×폼 1행, import는 도감 전체 재시딩
// (이사 코드로 도감이 통째로 바뀌므로 기록도 맞춰야 한다).
// export는 테스트용 — 이 순수 부분만 떼어 검증하면 supabase 목킹 없이 계약을 지킬 수 있다.
export function recordsFor(
  uid: string, state: GameState, action: GameAction, result: ActionResult,
  now = new Date().toISOString(),
) {
  const row = (fishId: string, form: string, rec: FormRecord) => ({
    user_id: uid, fish_id: fishId, form,
    count: rec.count, max_size: rec.maxSize, first_caught: rec.first, updated_at: now,
  });
  if (action.type === 'catch' && result.type === 'catch') {
    const rec = state.dex[result.fishId]?.[result.info.form];
    return rec ? [row(result.fishId, result.info.form, rec)] : [];
  }
  if (action.type === 'import') {
    return Object.entries(state.dex).flatMap(([fishId, forms]) =>
      Object.entries(forms).map(([form, rec]) => row(fishId, form, rec)));
  }
  return [];
}

// 유일한 실패 처리 지점 — 던져진 ApiError를 응답으로 변환하고, 5xx만 Sentry에 보고한다
// (4xx는 정상적인 프로토콜 응답이라 노이즈가 된다).
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
  if (req.headers['x-client-version'] !== APP_VERSION) {
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

  // 현재 상태 로드 — 없으면 구 saves(아카이브) 최신 행에서 1회 시딩(서버 권위 전환 이관),
  // 그것도 없으면 새 시작. 시딩 경합은 PK 충돌 시 재조회로 해소.
  let row = (await admin.from('saves_current').select('data, version').eq('user_id', uid).maybeSingle()).data;
  if (!row) {
    const { data: old } = await admin.from('saves').select('data')
      .eq('user_id', uid).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    const seeded = { user_id: uid, data: migrate(old?.data ?? newState()), version: 1 };
    const { error: seedErr } = await admin.from('saves_current').insert(seeded);
    if (seedErr) { // 동시 첫 액션 경합 — 상대가 시딩했으니 다시 읽는다
      row = (await admin.from('saves_current').select('data, version').eq('user_id', uid).maybeSingle()).data;
      if (!row) throw new ApiError(500, 'db-seed', { uid }, { cause: seedErr });
    } else {
      row = { data: seeded.data, version: 1 };
    }
  }

  const state = migrate(row.data);

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
    .update({ data: out.state, version: nextVersion, updated_at: new Date().toISOString() })
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
  // 종×폼 기록(0006) — events 보관주기와 무관하게 살아남는 통계 정본 (랭킹·최초발견의 근거).
  // 값은 리듀서가 방금 계산한 dex를 그대로 쓴다(재계산 금지). 증분이 아니라 절대값 upsert라
  // 한 번 실패해도 다음 캐치가 자가 치유한다.
  const recordRows = recordsFor(uid, out.state, action, out.result);
  if (recordRows.length > 0) {
    followUps.push(Promise.resolve(admin.from('records').upsert(recordRows)));
  }
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
