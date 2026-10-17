// supabase-js가 테스트용 PostgREST 컨테이너에 닿게 하는 대역. test:db의 setupFiles에서만 쓴다.
// 호스팅 환경은 PostgREST를 /rest/v1 아래에 두고, 테스트 컨테이너는 루트에서 응답하므로 경로 접두어를 뗀다.
// 인증 서버는 띄우지 않는다. auth.getUser는 요청 토큰의 클레임(sub·email)으로 사용자 응답을 만든다.
import { vi } from 'vitest';

function claims(authorization: string | null): Record<string, unknown> | null {
  const token = authorization?.replace(/^Bearer\s+/i, '') ?? '';
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const shimFetch: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname === '/auth/v1/user') {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const c = claims(headers.get('authorization'));
    if (!c || typeof c.sub !== 'string') {
      return new Response(JSON.stringify({ code: 401, msg: 'invalid token' }), { status: 401 });
    }
    return new Response(JSON.stringify({ id: c.sub, email: c.email ?? null, aud: 'authenticated', role: 'authenticated' }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  }
  url.pathname = url.pathname.replace(/^\/rest\/v1/, '');
  return fetch(input instanceof Request ? new Request(url, input) : url, init);
};

vi.mock('@supabase/supabase-js', async importOriginal => {
  const mod = await importOriginal<typeof import('@supabase/supabase-js')>();
  return {
    ...mod,
    createClient: ((url: string, key: string, options?: Parameters<typeof mod.createClient>[2]) =>
      mod.createClient(url, key, { ...options, global: { ...options?.global, fetch: shimFetch } })) as typeof mod.createClient,
  };
});
