// 세이브 쓰기 API — 클라이언트 직접 쓰기를 대체 (Vercel Function, Node 런타임)
// 검증 규칙은 src/validate.ts (클라이언트와 공유). service role 키는 서버 전용 환경변수.
// 프로덕션 Supabase에는 supabase/migrations/0002 적용(클라이언트 쓰기 정책 회수)이 전제.
// saves는 append-only(0003) — 절대 update/upsert로 이전 행을 덮지 않는다. 검증 통과분만
// insert만 하므로, 배포 중 migrate()/validateSave 버그가 있어도 직전 정상 행은 그대로 남는다.
//
// ⚠️ 시그니처는 Node 스타일(req, res)만 쓴다. Web 표준 시그니처(handler(req: Request))로
// 배포했다가 런타임이 default export를 Node 스타일로 호출해 req.headers.get이 없어서
// 전부 500이 났다(2026-08-21 사고). Vercel 런타임에서
// default export = Node 시그니처가 보장 동작이다.
import { createClient } from '@supabase/supabase-js';
import type { IncomingMessage, ServerResponse } from 'node:http';
// 확장자(.js) 필수 — Vercel Node 함수는 Vite 같은 번들러 없이 Node의 순수 ESM 로더로
// 이 파일을 실행한다. Node ESM은 상대경로 import에 확장자가 없으면 해석하지 못한다
// (ERR_MODULE_NOT_FOUND). 소스는 .ts지만 컴파일 결과물(.js) 기준으로 적어야 한다.
import { migrate } from '../src/logic.js';
import { validateSave } from '../src/validate.js';

// @vercel/node 헬퍼가 붙은 req/res — 패키지 타입 의존 없이 필요한 것만 선언
type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method-not-allowed' }); return; }

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

  // body는 content-type: application/json이면 Vercel이 파싱해 둔다. 문자열이면 직접 파싱.
  let body: unknown = req.body ?? null;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') { res.status(400).json({ error: 'bad-json' }); return; }
  const next = migrate(body); // 형태 정규화 (버전 체인 + 필드 위생)

  // 직전 저장본과 대조 (단조성·속도 상한) — append-only라 "가장 최근 행"을 찾는다
  const { data: prevRow, error: readError } = await admin
    .from('saves')
    .select('data, updated_at')
    .eq('user_id', uid)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) { res.status(500).json({ error: 'db-read' }); return; }
  const prev = prevRow ? migrate(prevRow.data) : null;
  const elapsedMs = prevRow ? Date.now() - new Date(prevRow.updated_at).getTime() : null;

  const verdict = validateSave(next, prev, elapsedMs);
  if (!verdict.ok) { res.status(409).json({ error: `invalid:${verdict.reason}` }); return; }

  // insert만 — 이전 행을 덮지 않는다 (0003, 배포 안전망)
  const { error: writeError } = await admin.from('saves').insert({
    user_id: uid,
    data: next,
    updated_at: new Date().toISOString(),
  });
  if (writeError) { res.status(500).json({ error: 'db-write' }); return; }

  res.status(200).json({ ok: true });
}
