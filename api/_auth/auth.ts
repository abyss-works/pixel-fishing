// 인증 구성. Better Auth 인스턴스를 만든다.
// 게임 코드에 의존하지 않는다. 다른 앱도 연결 풀과 구글 클라이언트만 넘겨 같은 구성으로 쓸 수 있다.
// 표는 auth 스키마의 users·sessions·accounts·verifications이고 열 이름은 snake_case다.
import { betterAuth } from 'better-auth';
import { anonymous } from 'better-auth/plugins';
import { createHmac, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { accountLinking, dropOAuthTokens, finishGoogleLink, googleProvider, guardAuthRequests, validateGoogleLink } from './googleLink.js';
import type { GoogleConfig, GuestLinkedReward, RecordLinkConsent } from './googleLink.js';
import { TRUSTED_PROXY_CIDRS } from './trustedProxy.js';

export interface AuthConfig {
  pool: Pool;
  secret: string;
  /** 앱의 공개 주소. 예: https://pixel-fishing.abyssworks.dev */
  baseURL: string;
  google: GoogleConfig;
  /** 구글 연결이 끝난 계정의 약관 수락을 기록한다 */
  recordLinkConsent: RecordLinkConsent;
  /** 게스트가 처음 구글 계정을 연결해 정식 계정으로 승격될 때 실행한다 */
  onGuestLinked?: GuestLinkedReward;
}

// 게스트의 신원은 세션 하나뿐이라 세션이 끝나면 계정을 잃는다. 1년 동안 쓰지 않을 때만 끝나게 한다.
const SESSION_EXPIRES_IN = 60 * 60 * 24 * 365;
// 익명 계정의 자리표시 이메일 도메인. 예약된 최상위 도메인이라 실제 주소와 겹치지 않는다.
export const ANONYMOUS_EMAIL_DOMAIN = 'anonymous.invalid';
const DEFAULT_ANON_SIGN_IN_RATE_MAX = 200;
const DEFAULT_ANON_SIGN_IN_RATE_WINDOW_SEC = 60 * 60;

/** 양의 정수 환경변수를 파싱한다. 비어 있거나 양의 정수가 아니면 기본값으로 폴백한다 */
export function parsePositiveIntEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return fallback;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** 익명 계정 생성 경로의 IP당 생성 상한을 환경변수에서 읽는다 */
export function anonymousSignInRateLimit(env: NodeJS.ProcessEnv = process.env): { window: number; max: number } {
  return {
    window: parsePositiveIntEnv(env.ANON_SIGN_IN_RATE_WINDOW_SEC, DEFAULT_ANON_SIGN_IN_RATE_WINDOW_SEC),
    max: parsePositiveIntEnv(env.ANON_SIGN_IN_RATE_MAX, DEFAULT_ANON_SIGN_IN_RATE_MAX),
  };
}

/** 익명 계정 생성 경로(/api/auth/sign-in/anonymous)의 IP당 생성 상한(기본 3600초당 최대 200회) */
export const ANONYMOUS_SIGN_IN_RATE_LIMIT = anonymousSignInRateLimit();
// 이메일·비밀번호 로그인·가입·재설정 경로는 사용하지 않아 라우터 진입에서 차단한다.
const DISABLED_EMAIL_PASSWORD_PATHS = ['/sign-in/email', '/sign-up/email', '/request-password-reset', '/reset-password'];

const timestamps = { createdAt: 'created_at', updatedAt: 'updated_at' } as const;

// 게임과 관리자 인증이 함께 쓰는 표 구성
const userTable = {
  modelName: 'auth.users',
  fields: { emailVerified: 'email_verified', ...timestamps },
};
const sessionTable = {
  modelName: 'auth.sessions',
  fields: { userId: 'user_id', expiresAt: 'expires_at', ipAddress: 'ip_address', userAgent: 'user_agent', ...timestamps },
};
const accountTable = {
  modelName: 'auth.accounts',
  fields: {
    userId: 'user_id', accountId: 'account_id', providerId: 'provider_id',
    accessToken: 'access_token', refreshToken: 'refresh_token', idToken: 'id_token',
    accessTokenExpiresAt: 'access_token_expires_at', refreshTokenExpiresAt: 'refresh_token_expires_at',
    ...timestamps,
  },
};
// 세션 행에는 접속 IP와 브라우저 정보를 저장하지 않고 비워 둔다. 요청 수 제한은 요청에서 IP를 직접 읽으므로 이 값과 무관하다.
const sessionHooks = {
  create: {
    before: async (session: Record<string, unknown>) => ({ data: { ...session, ipAddress: null, userAgent: null } }),
  },
};
const verificationTable = {
  modelName: 'auth.verifications',
  fields: { expiresAt: 'expires_at', ...timestamps },
};

const ipAddressConfig = {
  ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'],
  trustedProxies: [...TRUSTED_PROXY_CIDRS],
};

/** 인증 라이브러리 429 응답의 X-Retry-After 값을 표준 Retry-After 헤더에도 함께 싣는다 */
function withRetryAfterHeader<
  T extends { handler: (req: Request) => Promise<Response>; fetch: (req: Request) => Promise<Response> },
>(auth: T): T {
  const original = auth.handler;
  const wrapped = async (req: Request): Promise<Response> => {
    const res = await original(req);
    if (res.status !== 429 || res.headers.has('retry-after')) return res;
    const retryAfter = res.headers.get('x-retry-after');
    if (!retryAfter) return res;
    const headers = new Headers(res.headers);
    headers.set('retry-after', retryAfter);
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };
  return { ...auth, handler: wrapped, fetch: wrapped };
}

export function createAuth(config: AuthConfig) {
  const finishLink = finishGoogleLink(config.recordLinkConsent, config.onGuestLinked);
  const auth = betterAuth({
    database: config.pool,
    secret: config.secret,
    baseURL: config.baseURL,
    basePath: '/api/auth',
    disabledPaths: DISABLED_EMAIL_PASSWORD_PATHS,
    emailAndPassword: { enabled: false },
    user: { ...userTable, validateUserInfo: validateGoogleLink },
    session: {
      ...sessionTable,
      expiresIn: SESSION_EXPIRES_IN,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    socialProviders: { google: googleProvider(config.google) },
    account: { ...accountTable, accountLinking, updateAccountOnSignIn: false },
    verification: verificationTable,
    databaseHooks: {
      session: sessionHooks,
      account: {
        create: { before: dropOAuthTokens.create?.before, after: finishLink.create?.after },
        update: { before: dropOAuthTokens.update?.before, after: finishLink.update?.after },
      },
    },
    hooks: { before: guardAuthRequests },
    rateLimit: {
      customRules: {
        '/sign-in/anonymous': anonymousSignInRateLimit(),
      },
    },
    advanced: { database: { generateId: 'uuid' }, ipAddress: ipAddressConfig },
    plugins: [
      anonymous({
        // 다른 계정으로 로그인해도 게스트 계정과 진행을 지우지 않는다. 운영자 이관의 근거로 남긴다.
        disableDeleteAnonymousUser: true,
        generateRandomEmail: () => `${randomUUID()}@${ANONYMOUS_EMAIL_DOMAIN}`,
        schema: { user: { fields: { isAnonymous: 'is_anonymous' } } },
      }),
    ],
  });
  return withRetryAfterHeader(auth);
}

/** 관리자 세션 쿠키 이름의 앞부분. 게임 세션 쿠키(better-auth)와 이름이 달라 서로의 로그인·로그아웃이 영향을 주지 않는다 */
export const ADMIN_COOKIE_PREFIX = 'pixel-fishing-admin';

/**
 * 관리자 세션 쿠키를 서명하는 비밀값. 앱 비밀값에서 파생한다.
 * 서명 키가 달라 게임 세션 쿠키의 값을 관리자 쿠키 이름으로 옮겨도 관리자 세션으로 인정되지 않는다.
 */
export const adminSecret = (secret: string): string =>
  createHmac('sha256', secret).update('admin-session').digest('base64url');

/**
 * 관리자 대시보드의 인증 인스턴스. 게임과 같은 계정 표의 구글 계정으로 로그인하고 별도 쿠키의 세션을 받는다.
 * 구글을 연결한 적 없는 계정은 로그인하지 못한다. 연결과 익명 로그인은 게임 인증만 제공한다.
 */
export function createAdminAuth(config: Omit<AuthConfig, 'recordLinkConsent'>) {
  const auth = betterAuth({
    database: config.pool,
    secret: adminSecret(config.secret),
    baseURL: config.baseURL,
    basePath: '/api/admin/auth',
    disabledPaths: DISABLED_EMAIL_PASSWORD_PATHS,
    user: userTable,
    session: sessionTable,
    socialProviders: { google: googleProvider(config.google) },
    // 관리자 인증은 로그인만 한다. 계정 연결은 게임 인증에서만 한다
    account: { ...accountTable, accountLinking: { ...accountLinking, enabled: false }, updateAccountOnSignIn: false },
    verification: verificationTable,
    databaseHooks: { session: sessionHooks, account: dropOAuthTokens },
    hooks: { before: guardAuthRequests },
    rateLimit: {
      customRules: {
        '/sign-in/social': { window: 10, max: 20 },
      },
    },
    advanced: { database: { generateId: 'uuid' }, cookiePrefix: ADMIN_COOKIE_PREFIX, ipAddress: ipAddressConfig },
  });
  return withRetryAfterHeader(auth);
}

export type Auth = ReturnType<typeof createAuth>;
export type AdminAuth = ReturnType<typeof createAdminAuth>;
