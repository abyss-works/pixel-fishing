// 인증 구성. Better Auth 인스턴스를 만든다.
// 게임 코드에 의존하지 않는다. 다른 앱도 연결 풀과 메일 발송기만 넘겨 같은 구성으로 쓸 수 있다.
// 표는 auth 스키마의 users·sessions·accounts·verifications이고 열 이름은 snake_case다.
import { betterAuth } from 'better-auth';
import { anonymous } from 'better-auth/plugins';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { MailSender } from './mail.js';
import { anonymousUpgrade } from './upgrade.js';

export interface AuthConfig {
  pool: Pool;
  secret: string;
  /** 앱의 공개 주소. 예: https://pixel-fishing.abyssworks.dev */
  baseURL: string;
  mail: MailSender;
}

export const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;
// 게스트의 신원은 세션 하나뿐이라 세션이 끝나면 계정을 잃는다. 1년 동안 쓰지 않을 때만 끝나게 한다.
const SESSION_EXPIRES_IN = 60 * 60 * 24 * 365;
// 익명 계정의 자리표시 이메일 도메인. 예약된 최상위 도메인이라 실제 주소와 겹치지 않는다.
export const ANONYMOUS_EMAIL_DOMAIN = 'anonymous.invalid';

const timestamps = { createdAt: 'created_at', updatedAt: 'updated_at' } as const;

export function createAuth(config: AuthConfig) {
  return betterAuth({
    database: config.pool,
    secret: config.secret,
    baseURL: config.baseURL,
    basePath: '/api/auth',
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      // 이전 인증 서버에서 옮긴 해시가 bcrypt라 새 해시도 bcrypt로 맞춘다.
      password: {
        hash: password => bcrypt.hash(password, 10),
        verify: ({ hash, password }) => bcrypt.compare(password, hash),
      },
      sendResetPassword: ({ user, url }) => config.mail.sendPasswordReset(user.email, url),
      revokeSessionsOnPasswordReset: true,
    },
    user: {
      modelName: 'auth.users',
      fields: { emailVerified: 'email_verified', ...timestamps },
    },
    session: {
      modelName: 'auth.sessions',
      fields: { userId: 'user_id', expiresAt: 'expires_at', ipAddress: 'ip_address', userAgent: 'user_agent', ...timestamps },
      expiresIn: SESSION_EXPIRES_IN,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    account: {
      modelName: 'auth.accounts',
      fields: {
        userId: 'user_id', accountId: 'account_id', providerId: 'provider_id',
        accessToken: 'access_token', refreshToken: 'refresh_token', idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at', refreshTokenExpiresAt: 'refresh_token_expires_at',
        ...timestamps,
      },
    },
    verification: {
      modelName: 'auth.verifications',
      fields: { expiresAt: 'expires_at', ...timestamps },
    },
    advanced: { database: { generateId: 'uuid' } },
    plugins: [
      anonymous({
        // 다른 계정으로 로그인해도 게스트 계정과 진행을 지우지 않는다. 운영자 이관의 근거로 남긴다.
        disableDeleteAnonymousUser: true,
        generateRandomEmail: () => `${randomUUID()}@${ANONYMOUS_EMAIL_DOMAIN}`,
        schema: { user: { fields: { isAnonymous: 'is_anonymous' } } },
      }),
      anonymousUpgrade({ minPasswordLength: MIN_PASSWORD_LENGTH, maxPasswordLength: MAX_PASSWORD_LENGTH }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
