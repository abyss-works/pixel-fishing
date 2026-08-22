// 액션 API — 모든 상태 변경의 유일한 서버 경로 (서버 권위 v0.5.0, Vercel Function, Node 런타임)
// 규칙 실행은 src/game/actions.ts(applyAction) — 클라이언트 LocalBackend와 같은 리듀서.
// 저장 모델(0005): saves_current(유저당 1행, 낙관 락) + events(append-only 정본 스트림)
// + saves(스냅샷 아카이브 — 50액션마다 append, 롤백 안전망). service role 키는 서버 전용.
//
// ⚠️ 시그니처는 Node 스타일(req, res)만 쓴다 — Web 표준 시그니처로 배포했다가 전부 500 났던
// 사고(2026-08-21) 재발 방지. default export = Node 시그니처.
import { createClient } from '@supabase/supabase-js';
import type { IncomingMessage, ServerResponse } from 'node:http';
// 확장자(.js) 필수 — Node 순수 ESM 로더가 src 모듈을 그대로 import한다 
import { migrate, newState } from '../src/game/logic.js';
import { applyAction, ACTION_TYPES } from '../src/game/actions.js';
import type { GameAction } from '../src/game/actions.js';
import { SNAPSHOT_EVERY } from '../src/game/balance.js';
import { APP_VERSION } from '../src/version.js';

type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

// 액션 화이트리스트는 리듀서(GameAction 유니온)에서 파생 — 이중 목록 드리프트 없음
const ACTION_TYPE_SET = new Set<string>(ACTION_TYPES);

// 첫 조우일은 유저 체감 날짜 — 서버는 UTC라 KST(UTC+9)로 고정 계산 (친구 그룹 전원 한국)
const todayKST = (): string => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method-not-allowed' }); return; }

  // 낡은 탭 차단 — 클라 번들 버전이 이 함수(같은 커밋 배포)와 다르면 426 Upgrade Required.
  // 인증/리듀서보다 먼저: 새 서버의 결과를 낡은 번들이 해석 못 해 깨지는 것을 원천 차단하고,
  // 클라이언트는 업데이트 모달(새로고침 안내)을 띄운다. 헤더 부재 = 기능 도입 전 구버전 → 동일 처리.
  if (req.headers['x-client-version'] !== APP_VERSION) {
    res.status(426).json({ error: 'version-mismatch', server: APP_VERSION });
    return;
  }

  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) { res.status(500).json({ error: 'server-config' }); return; }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 유저 확인 — 클라이언트 세션 토큰 검증 (Node 스타일 headers는 소문자 키 플레인 객체)
  const auth = req.headers.authorization ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const { data: userData, error: authError } = await admin.auth.getUser(token);
  if (authError || !userData.user) { res.status(401).json({ error: 'unauthorized' }); return; }
  const uid = userData.user.id;

  // body = GameAction (content-type: application/json이면 Vercel이 파싱해 둔다)
  let body: unknown = req.body ?? null;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const action = body as GameAction | null;
  if (!action || typeof action !== 'object' || !ACTION_TYPE_SET.has(action.type)) {
    res.status(400).json({ error: 'bad-action' });
    return;
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
      if (!row) { res.status(500).json({ error: 'db-seed' }); return; }
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

  const out = applyAction(state, action, { rng: Math.random, today: todayKST(), dynamicCoupon });
  if (!out.ok) { res.status(422).json({ error: out.error }); return; }

  // 낙관 락 갱신 — 읽은 version 그대로면 성공. 0행이면 다른 요청과 경합(멀티탭) → 409,
  // 클라이언트(HttpBackend)가 최신 상태 위에 1회 재시도한다.
  const nextVersion = Number(row.version) + 1;
  const { data: updated, error: updErr } = await admin.from('saves_current')
    .update({ data: out.state, version: nextVersion, updated_at: new Date().toISOString() })
    .eq('user_id', uid).eq('version', row.version)
    .select('user_id');
  if (updErr) { res.status(500).json({ error: 'db-write' }); return; }
  if (!updated || updated.length === 0) { res.status(409).json({ error: 'version-conflict' }); return; }

  // 이벤트 스트림 append — 락 획득 후에만 (실패해도 상태는 확정, 이벤트만 유실 — 수용)
  if (out.events.length > 0) {
    await admin.from('events').insert(out.events.map(e => ({ user_id: uid, type: e.type, payload: e.payload })));
  }

  // 주기 스냅샷 — saves는 append-only 아카이브로 존속 (0003의 안전망 역할 유지)
  if (nextVersion % SNAPSHOT_EVERY === 0) {
    await admin.from('saves').insert({ user_id: uid, data: out.state, updated_at: new Date().toISOString() });
  }

  res.status(200).json({ state: out.state, result: out.result });
}
