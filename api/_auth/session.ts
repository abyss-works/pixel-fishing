// 요청의 로그인 세션 — 서버 함수가 요청한 사용자를 정한다. 게임과 관리자 대시보드의 인증 인스턴스를 환경 변수로 조립한다.
import type { IncomingHttpHeaders } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import { database } from '../_db/client.js';
import { ApiError } from '../errors.js';
import { createAdminAuth, createAuth } from './auth.js';
import { consentPolicy } from './consentPolicy.js';
import type { AdminAuth, Auth } from './auth.js';
import type { GoogleConfig } from './googleLink.js';
import { resendSender } from './mail.js';

let appAuthInstance: Auth | null = null;

/** 구글 OAuth 클라이언트. 환경 변수가 하나라도 없으면 null이다 */
function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** 앱의 인증 인스턴스. 인스턴스마다 한 번 만들고, 필수 환경 변수(약관 시행일 포함)가 없으면 실패한다 */
export function appAuth(): Auth {
  if (appAuthInstance) return appAuthInstance;
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  const google = googleConfig();
  if (!secret || !baseURL || !apiKey || !from || !google) throw new ApiError(500, 'server-config');
  // 약관 시행일이 없거나 날짜가 아니면 서버가 기동하지 않는다
  consentPolicy();
  appAuthInstance = createAuth({
    pool: database().pool, secret, baseURL, google,
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

let adminAuthInstance: AdminAuth | null = null;

/** 관리자 대시보드의 인증 인스턴스. 인스턴스마다 한 번 만들고, 필수 환경 변수가 없으면 실패한다 */
export function adminAuth(): AdminAuth {
  if (adminAuthInstance) return adminAuthInstance;
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  const google = googleConfig();
  if (!secret || !baseURL || !google) throw new ApiError(500, 'server-config');
  adminAuthInstance = createAdminAuth({ pool: database().pool, secret, baseURL, google });
  return adminAuthInstance;
}

/** 요청 쿠키의 관리자 세션 사용자 id. 게임 세션 쿠키는 인정하지 않고, 세션이 없거나 만료됐으면 null이다 */
export async function adminSessionUid(headers: IncomingHttpHeaders): Promise<string | null> {
  const result = await adminAuth().api.getSession({ headers: fromNodeHeaders(headers) });
  return result?.user.id ?? null;
}
