// 서버 함수가 쓰는 외부 호출의 테스트 대역. test:db의 setupFiles에서만 쓴다.
// 인증 서버는 띄우지 않는다. supabase-js의 auth.getUser는 요청 토큰의 클레임(sub·email)으로 사용자 응답을 만든다.
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
  throw new Error(`테스트에서 예상하지 못한 supabase 요청입니다: ${url.pathname}`);
};

vi.mock('@supabase/supabase-js', async importOriginal => {
  const mod = await importOriginal<typeof import('@supabase/supabase-js')>();
  return {
    ...mod,
    createClient: ((url: string, key: string, options?: Parameters<typeof mod.createClient>[2]) =>
      mod.createClient(url, key, { ...options, global: { ...options?.global, fetch: shimFetch } })) as typeof mod.createClient,
  };
});

// 응답 뒤 후속 쓰기(waitUntil) — 테스트는 요청 처리 함수가 끝난 뒤 이 작업까지 기다리고 DB 상태를 본다.
export const pendingAfterResponse: Promise<unknown>[] = [];
vi.mock('@vercel/functions', async importOriginal => {
  const mod = await importOriginal<typeof import('@vercel/functions')>();
  return { ...mod, waitUntil: (p: Promise<unknown>) => { pendingAfterResponse.push(p); } };
});
