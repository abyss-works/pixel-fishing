// 요청의 로그인 세션 — 서버 함수가 요청한 사용자를 정한다. 앱의 인증 인스턴스를 환경 변수로 조립한다.
import type { IncomingHttpHeaders } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import { database } from '../_db/client.js';
import { ApiError } from '../errors.js';
import { createAuth } from './auth.js';
import type { Auth } from './auth.js';
import { resendSender } from './mail.js';

let appAuthInstance: Auth | null = null;

/** 앱의 인증 인스턴스. 인스턴스마다 한 번 만들고, 필수 환경 변수가 없으면 실패한다 */
export function appAuth(): Auth {
  if (appAuthInstance) return appAuthInstance;
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!secret || !baseURL || !apiKey || !from) throw new ApiError(500, 'server-config');
  appAuthInstance = createAuth({
    pool: database().pool, secret, baseURL,
    mail: resendSender({ apiKey, from, serviceName: '픽셀 낚시' }),
  });
  return appAuthInstance;
}

export interface SessionUser {
  id: string;
  /** 영구 계정의 이메일. 게스트는 null이다 */
  email: string | null;
}

/**
 * 요청 쿠키의 로그인 사용자. 세션이 없거나 만료됐으면 null이다.
 * 쿠키 캐시를 쓰지 않고 세션 표를 읽는다. 재설정·탈퇴로 끊은 세션이 캐시 수명 동안 통과하지 않게 하기 위해서다.
 */
export async function sessionOf(headers: IncomingHttpHeaders): Promise<SessionUser | null> {
  const result = await appAuth().api.getSession({ headers: fromNodeHeaders(headers), query: { disableCookieCache: true } });
  if (!result) return null;
  const user = result.user as { id: string; email: string; isAnonymous?: boolean | null };
  return { id: user.id, email: user.isAnonymous ? null : user.email };
}
