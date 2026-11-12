// 구글 로그인과 계정 연결의 구성. 공급자 옵션, 연결 전 검증, 연결 뒤 마무리, 토큰 비움 훅을 모아 인증 구성이 조립만 하게 한다.
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import type { GenericEndpointContext } from 'better-auth';
import { setSessionCookie } from 'better-auth/cookies';
import type { BetterAuthOptions } from 'better-auth';

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

/** 구글에 요청하는 정보 범위. 식별자와 이메일뿐이다 */
export const GOOGLE_SCOPES = ['openid', 'email'];

/** 연결 실패와 로그인 실패를 화면에 알리는 결과 코드(콜백 리디렉션의 error 질의) */
export const GOOGLE_LINK_ERRORS = {
  /** 게스트의 구글 주소가 구글을 연결하기 전 이메일 계정의 주소와 같다 */
  emailAccountExists: 'email_account_exists',
  /** 이미 구글을 연결한 계정이 다른 구글을 골랐다 */
  googleAlreadyConnected: 'google_already_connected',
  /** 라이브러리의 같은 이름 코드. 구글 계정이 다른 계정에 연결돼 있거나, 이메일 계정이 고른 구글의 주소를 다른 계정이 쓴다 */
  linkedToDifferentUser: 'account_already_linked_to_different_user',
  /** 게스트의 구글 주소를 다른 구글을 이미 연결한 계정이 이메일로 쓴다. 라이브러리의 같은 이름 코드 */
  unableToLink: 'unable_to_link_account',
} as const;

/** 구글 공급자 옵션. 연결한 적 없는 구글로는 가입하지 않고, 계정 선택 화면을 매번 띄운다 */
export const googleProvider = ({ clientId, clientSecret }: GoogleConfig) => ({
  clientId,
  clientSecret,
  scope: GOOGLE_SCOPES,
  disableDefaultScope: true,
  includeGrantedScopes: false,
  prompt: 'select_account' as const,
  disableImplicitSignUp: true,
  // 요청 본문의 requestSignUp으로도 가입하지 않는다
  disableSignUp: true,
});

/** 이메일이 같다는 이유로 자동 연결하지 않는다. 연결은 로그인한 사용자가 직접 한다 */
export const accountLinking = {
  enabled: true,
  disableImplicitLinking: true,
  allowDifferentEmails: true,
} as const;

type Hooks = NonNullable<BetterAuthOptions['databaseHooks']>;
type ValidateUserInfo = NonNullable<NonNullable<BetterAuthOptions['user']>['validateUserInfo']>;

const dropTokens = (account: Record<string, unknown>) => ({
  data: {
    ...account,
    accessToken: null, refreshToken: null, idToken: null,
    accessTokenExpiresAt: null, refreshTokenExpiresAt: null,
  },
}) as never;

/** 구글이 준 접근·갱신·ID 토큰을 저장 직전에 비운다. 게임은 구글 API를 부르지 않는다 */
export const dropOAuthTokens: NonNullable<Hooks['account']> = {
  create: { before: async account => dropTokens(account) },
  update: { before: async account => dropTokens(account as Record<string, unknown>) },
};

// 연결 전 검증이 통과시킨 구글 주소. 같은 요청의 연결 마무리가 이어받는다.
const verifiedEmail = new WeakMap<object, string>();

interface LinkedUser { id: string; isAnonymous?: boolean | null }

/**
 * 구글 연결 전 검증. 연결이 사용자 행에 줄 영향(이메일 변경)과 계정당 구글 하나의 제약을 앞서 판정한다.
 * 실패 코드는 콜백 리디렉션의 error 질의로 나간다.
 */
export const validateGoogleLink: ValidateUserInfo = async ({ user, source }, ctx) => {
  if (source.method !== 'oauth' || source.action !== 'link-account') return;
  const adapter = ctx.context.internalAdapter;
  const profile = source.oauth?.profile as { sub?: unknown } | undefined;
  const sub = typeof profile?.sub === 'string' ? profile.sub : '';
  const userId = String(user.id);

  // 구글 계정을 다른 사용자가 가졌으면 라이브러리가 연결 충돌로 알린다
  const owner = await adapter.findAccountByKey({ providerId: 'google', accountId: sub });
  if (owner && owner.userId !== userId) return;
  // 같은 구글을 이 사용자가 이미 가졌으면 마무리를 다시 하는 연결이다
  if (!owner) {
    const mine = await adapter.findAccounts(userId);
    if (mine.some(a => a.providerId === 'google')) return { error: GOOGLE_LINK_ERRORS.googleAlreadyConnected };
  }

  const email = String(user.email).toLowerCase();
  const holder = await adapter.findUserByEmail(email, { includeAccounts: true });
  if (holder && holder.user.id !== userId) {
    const self = await adapter.findUserById(userId) as LinkedUser | null;
    // 구글을 연결하지 않은 이메일 계정만 이메일로 로그인해 연결할 수 있다
    const holderHasGoogle = holder.accounts.some(a => a.providerId === 'google');
    if (!self?.isAnonymous) return { error: GOOGLE_LINK_ERRORS.linkedToDifferentUser };
    // 이메일로 로그인할 수 없는 계정의 주소라 이메일 로그인 안내도 덮어쓰기 확인도 맞지 않다
    return { error: holderHasGoogle ? GOOGLE_LINK_ERRORS.unableToLink : GOOGLE_LINK_ERRORS.emailAccountExists };
  }
  verifiedEmail.set(ctx, email);
};

type AccountAfter = (account: { userId: string; providerId: string }, ctx: GenericEndpointContext | null) => Promise<void>;

/** 같은 상태에서 몇 번을 돌려도 같은 결과가 되는 연결 마무리 */
const finishLink: AccountAfter = async (account, ctx) => {
  if (!ctx || account.providerId !== 'google') return;
  const email = verifiedEmail.get(ctx);
  if (!email) return;
  const adapter = ctx.context.internalAdapter;
  const current = await getSessionFromCtx(ctx, { disableCookieCache: true, disableRefresh: true });
  const user = await adapter.findUserById(account.userId) as (LinkedUser & { email: string; emailVerified: boolean }) | null;
  const passwords = (await adapter.findAccounts(account.userId)).filter(a => a.providerId === 'credential');
  // 마무리가 바꿀 것이 없으면 다른 세션을 끊지 않는다
  if (!user || (!user.isAnonymous && user.email === email && user.emailVerified && passwords.length === 0)) return;
  const updated = await adapter.updateUser(account.userId, { email, emailVerified: true, isAnonymous: false });
  for (const a of passwords) await adapter.deleteAccount(a.id);
  for (const s of await adapter.listSessions(account.userId)) {
    if (s.token !== current?.session.token) await adapter.deleteSession(s.token);
  }
  await ctx.context.adapter.deleteMany({
    model: 'verification',
    where: [{ field: 'value', value: account.userId }, { field: 'identifier', operator: 'starts_with', value: 'reset-password:' }],
  });
  // 쿠키 캐시에 남은 게스트 표시와 이전 이메일을 갱신한다
  if (current && current.user.id === account.userId) await setSessionCookie(ctx, { session: current.session, user: updated });
};

/**
 * 구글 연결 뒤 사용자 행을 마무리한다. 이메일을 구글 주소로 바꾸고 게스트 표시를 내린다.
 * 비밀번호 수단이 있던 계정은 그것을 지우고, 연결한 세션만 남기고 다른 세션을 끊고, 아직 쓰지 않은 재설정 토큰을 지운다.
 * 같은 구글을 다시 연결하는 요청(계정 갱신 경로)에서도 돌아, 마무리가 끝나지 않은 계정을 마저 마무리한다.
 */
export const finishGoogleLink: NonNullable<Hooks['account']> = {
  create: { after: finishLink },
  update: { after: finishLink },
};

const OAUTH_START_PATHS = ['/link-social', '/sign-in/social'];

const badRequest = (code: string, message: string) => new APIError('BAD_REQUEST', { code, message });

/** 구글 인증 요청의 범위와 매개변수는 서버가 정한다. ID 토큰 연결은 받지 않는다. 비밀번호 수단이 없는 계정의 재설정 토큰은 거부한다 */
export const guardAuthRequests = createAuthMiddleware(async ctx => {
  const body = ctx.body as { scopes?: unknown; additionalParams?: unknown; idToken?: unknown; token?: unknown } | undefined;
  if (OAUTH_START_PATHS.includes(ctx.path)) {
    if (body?.scopes !== undefined || body?.additionalParams !== undefined) {
      throw badRequest('OAUTH_REQUEST_OVERRIDE_NOT_ALLOWED', 'Scopes and additional parameters are fixed by the server');
    }
    if (ctx.path === '/link-social' && body?.idToken !== undefined) {
      throw badRequest('ID_TOKEN_LINK_NOT_ALLOWED', 'Linking with an id token is not allowed');
    }
  }
  if (ctx.path === '/reset-password') {
    const token = body?.token ?? (ctx.query as { token?: unknown } | undefined)?.token;
    if (typeof token !== 'string') return;
    const found = await ctx.context.internalAdapter.findVerificationValue(`reset-password:${token}`);
    if (found && !await ctx.context.internalAdapter.findCredentialAccount(found.value)) {
      throw badRequest('INVALID_TOKEN', 'Invalid token');
    }
  }
});
