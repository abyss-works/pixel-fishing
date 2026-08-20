// 세이브 쓰기 API — 클라이언트 직접 upsert를 대체 (Vercel Function, Node 런타임)
// 검증 규칙은 src/validate.ts (클라이언트와 공유). service role 키는 서버 전용 환경변수.
// 프로덕션 Supabase에는 supabase/migrations/0002 적용(클라이언트 쓰기 정책 회수)이 전제.
import { createClient } from '@supabase/supabase-js';
import { migrate } from '../src/logic';
import { validateSave } from '../src/validate';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return json({ error: 'server-config' }, 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 유저 확인 — 클라이언트 세션 토큰 검증
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: authError } = await admin.auth.getUser(token);
  if (authError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const uid = userData.user.id;

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: 'bad-json' }, 400);
  const next = migrate(body); // 형태 정규화 (버전 체인 + 필드 위생)

  // 직전 저장본과 대조 (단조성·속도 상한)
  const { data: prevRow, error: readError } = await admin
    .from('saves')
    .select('data, updated_at')
    .eq('user_id', uid)
    .maybeSingle();
  if (readError) return json({ error: 'db-read' }, 500);
  const prev = prevRow ? migrate(prevRow.data) : null;
  const elapsedMs = prevRow ? Date.now() - new Date(prevRow.updated_at).getTime() : null;

  const verdict = validateSave(next, prev, elapsedMs);
  if (!verdict.ok) return json({ error: `invalid:${verdict.reason}` }, 409);

  const { error: writeError } = await admin.from('saves').upsert({
    user_id: uid,
    data: next,
    updated_at: new Date().toISOString(),
  });
  if (writeError) return json({ error: 'db-write' }, 500);

  return json({ ok: true });
}
