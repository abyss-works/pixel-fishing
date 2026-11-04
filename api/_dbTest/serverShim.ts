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
  return realFetch(input, init);
}) as typeof fetch;

// 응답 뒤 후속 쓰기(afterResponse) — 테스트는 요청 처리 함수가 끝난 뒤 이 작업까지 기다리고 DB 상태를 본다.
export const pendingAfterResponse: Promise<unknown>[] = [];
vi.mock('../_server/afterResponse.js', () => ({
  afterResponse: (p: Promise<unknown>) => { pendingAfterResponse.push(p); },
  settleAfterResponse: async () => { await Promise.allSettled(pendingAfterResponse); },
}));
