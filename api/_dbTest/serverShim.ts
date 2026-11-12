// 서버 함수가 쓰는 외부 호출의 테스트 대역. test:db의 setupFiles에서만 쓴다.
import { vi } from 'vitest';

// 메일 발송(Resend) — 실제로 보내지 않고 받은 요청 본문을 쌓는다. 다른 외부 요청은 원래 fetch로 넘긴다.
export const sentMails: { to: string[]; subject: string; text: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === 'https://api.resend.com/emails') {
    sentMails.push(JSON.parse(String(init?.body)) as { to: string[]; subject: string; text: string });
    return new Response(JSON.stringify({ id: 'test-mail' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url === 'https://oauth2.googleapis.com/token') return googleTokenResponse(init);
  return realFetch(input, init);
}) as typeof fetch;

// 구글 토큰 교환 — 인가 코드별로 정해 둔 신원의 서명 없는 ID 토큰을 돌려준다.
export interface GoogleIdentity { sub: string; email: string; verified?: boolean }
export const googleIdentities = new Map<string, GoogleIdentity>();
/** 다음 구글 콜백에서 쓸 인가 코드와 그 코드가 가리키는 구글 계정을 등록한다 */
export function googleCode(code: string, identity: GoogleIdentity): string {
  googleIdentities.set(code, identity);
  return code;
}
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const googleTokenResponse = async (init?: RequestInit): Promise<Response> => {
  const code = new URLSearchParams(String(init?.body ?? '')).get('code') ?? '';
  const who = googleIdentities.get(code);
  if (!who) return new Response('{"error":"invalid_grant"}', { status: 400, headers: { 'content-type': 'application/json' } });
  const idToken = `${b64({ alg: 'RS256' })}.${b64({ iss: 'https://accounts.google.com', aud: 'test', sub: who.sub, email: who.email, email_verified: who.verified ?? true })}.sig`;
  return new Response(JSON.stringify({
    access_token: `at-${code}`, refresh_token: `rt-${code}`, id_token: idToken, expires_in: 3600, token_type: 'Bearer',
    scope: 'openid https://www.googleapis.com/auth/userinfo.email',
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};

// 응답 뒤 후속 쓰기(afterResponse) — 테스트는 요청 처리 함수가 끝난 뒤 이 작업까지 기다리고 DB 상태를 본다.
export const pendingAfterResponse: Promise<unknown>[] = [];
vi.mock('../_server/afterResponse.js', () => ({
  afterResponse: (p: Promise<unknown>) => { pendingAfterResponse.push(p); },
  settleAfterResponse: async () => { await Promise.allSettled(pendingAfterResponse); },
}));
