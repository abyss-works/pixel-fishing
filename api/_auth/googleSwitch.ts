// 게스트→기존 구글 계정 전환용 1회용 전환 티켓 플러그인.
// 1차 연결 충돌 시 대상 계정과 게스트 세션을 바인딩한 단기(5분) 티켓을 verifications 표와 HttpOnly·SameSite=Lax 쿠키로 발급하고,
// 확인 엔드포인트에서 1회 소비해 2차 구글 인증 없이 즉시 전환하며, 취소·만료·다른 복귀 시 티켓과 쿠키를 정리한다.
import { randomBytes } from 'node:crypto';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint, createAuthMiddleware, getOAuthState, getSessionFromCtx, isAPIError } from 'better-auth/api';
import { expireCookie, setSessionCookie } from 'better-auth/cookies';

export const GOOGLE_SWITCH_COOKIE_NAME = 'google_switch_ticket';
export const GOOGLE_SWITCH_TTL_SEC = 5 * 60;
export const GOOGLE_SWITCH_IDENTIFIER_PREFIX = 'google-switch:';

export const GOOGLE_SWITCH_ERRORS = {
  ticketMissing: 'switch_ticket_missing',
  ticketExpired: 'switch_ticket_expired',
  sessionRequired: 'switch_session_required',
  sessionMismatch: 'switch_session_mismatch',
  targetUnavailable: 'switch_target_unavailable',
  sessionCreateFailed: 'switch_session_create_failed',
} as const;

export interface GoogleSwitchCandidate {
  guestUserId: string;
  targetUserId: string;
  accountId: string;
}

interface SwitchTicketPayload extends GoogleSwitchCandidate {
  guestSessionId: string;
}

interface SwitchUserRow {
  id: string;
  email: string;
  emailVerified: boolean;
  isAnonymous?: boolean | null;
}

const LINKED_TO_DIFFERENT_USER = 'account_already_linked_to_different_user';
// 1차 /callback/google 요청의 OAuth 상태 객체를 키로 사용해 validateGoogleLink와 hooks.after가 후보를 공유한다.
const switchCandidates = new WeakMap<object, GoogleSwitchCandidate>();

/** 연결 충돌 판정 시 같은 요청의 후속 훅이 전환 티켓을 발급할 수 있도록 후보를 기록한다 */
export function recordGoogleSwitchCandidate(oauthState: object, candidate: GoogleSwitchCandidate): void {
  switchCandidates.set(oauthState, candidate);
}

function takeGoogleSwitchCandidate(oauthState: object | null): GoogleSwitchCandidate | undefined {
  if (!oauthState) return undefined;
  const candidate = switchCandidates.get(oauthState);
  switchCandidates.delete(oauthState);
  return candidate;
}

const switchCookieOf = (ctx: { context: { createAuthCookie: (name: string, overrides?: { maxAge?: number }) => { name: string; attributes: Record<string, unknown> } } }) =>
  ctx.context.createAuthCookie(GOOGLE_SWITCH_COOKIE_NAME, { maxAge: GOOGLE_SWITCH_TTL_SEC });

function parseSwitchPayload(raw: string): SwitchTicketPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SwitchTicketPayload> | null;
    if (
      !parsed ||
      typeof parsed.guestUserId !== 'string' || !parsed.guestUserId ||
      typeof parsed.guestSessionId !== 'string' || !parsed.guestSessionId ||
      typeof parsed.targetUserId !== 'string' || !parsed.targetUserId ||
      typeof parsed.accountId !== 'string' || !parsed.accountId
    ) {
      return null;
    }
    return {
      guestUserId: parsed.guestUserId,
      guestSessionId: parsed.guestSessionId,
      targetUserId: parsed.targetUserId,
      accountId: parsed.accountId,
    };
  } catch {
    return null;
  }
}

function redirectErrorCode(ctx: { context: { baseURL: string; returned?: unknown; responseHeaders?: Headers } }): string | null {
  const returnedHeaders = isAPIError(ctx.context.returned) ? ctx.context.returned.headers : undefined;
  const location = returnedHeaders?.get('location') ?? ctx.context.responseHeaders?.get('location');
  if (!location) return null;
  try {
    return new URL(location, ctx.context.baseURL).searchParams.get('error');
  } catch {
    return null;
  }
}

function isTrustedSwitchOrigin(ctx: {
  request?: Request;
  context: { baseURL: string; isTrustedOrigin: (url: string, settings?: { allowRelativePaths: boolean }) => boolean };
}): boolean {
  if (!ctx.request) return true;
  const headers = ctx.request.headers;
  if (!headers.has('cookie') && !headers.get('origin') && !headers.get('referer')) return true;
  const originHeader = headers.get('origin') || headers.get('referer') || '';
  if (!originHeader || originHeader === 'null') return false;
  try {
    const reqOrigin = new URL(originHeader).origin;
    const baseOrigin = new URL(ctx.context.baseURL).origin;
    return reqOrigin === baseOrigin || ctx.context.isTrustedOrigin(reqOrigin, { allowRelativePaths: false });
  } catch {
    return false;
  }
}

/** 게스트가 기존 구글 계정으로 1회 인증 전환할 때 쓰는 티켓 발급·확인·취소 플러그인 */
export function googleSwitchPlugin(): BetterAuthPlugin {
  return {
    id: 'google-switch',
    endpoints: {
      confirmGoogleSwitch: createAuthEndpoint('/confirm-google-switch', {
        method: 'POST',
      }, async ctx => {
        ctx.setHeader('cache-control', 'private, no-store');
        if (!isTrustedSwitchOrigin(ctx)) {
          throw ctx.error('FORBIDDEN', { code: 'INVALID_ORIGIN', message: 'Invalid origin' });
        }

        const switchCookie = switchCookieOf(ctx);
        const current = await getSessionFromCtx(ctx, { disableCookieCache: true, disableRefresh: true });
        if (!current) {
          throw ctx.error('UNAUTHORIZED', { code: GOOGLE_SWITCH_ERRORS.sessionRequired, message: 'Active session is required' });
        }

        const signedIdentifier = await ctx.getSignedCookie(switchCookie.name, ctx.context.secret);
        if (!signedIdentifier) {
          if (ctx.getCookie(switchCookie.name)) expireCookie(ctx, switchCookie);
          throw ctx.error('BAD_REQUEST', { code: GOOGLE_SWITCH_ERRORS.ticketMissing, message: 'Switch ticket is missing' }, ctx.responseHeaders);
        }

        const adapter = ctx.context.internalAdapter;
        const existing = await adapter.findVerificationValue(signedIdentifier);
        if (!existing || existing.expiresAt <= new Date()) {
          if (existing) await adapter.deleteVerificationByIdentifier(signedIdentifier);
          expireCookie(ctx, switchCookie);
          throw ctx.error('BAD_REQUEST', { code: GOOGLE_SWITCH_ERRORS.ticketExpired, message: 'Switch ticket is expired' }, ctx.responseHeaders);
        }

        const payload = parseSwitchPayload(existing.value);
        if (!payload) {
          await adapter.deleteVerificationByIdentifier(signedIdentifier);
          expireCookie(ctx, switchCookie);
          throw ctx.error('BAD_REQUEST', { code: GOOGLE_SWITCH_ERRORS.ticketExpired, message: 'Switch ticket is invalid' }, ctx.responseHeaders);
        }

        const currentUser = current.user as SwitchUserRow;
        if (
          !currentUser.isAnonymous ||
          currentUser.id !== payload.guestUserId ||
          current.session.id !== payload.guestSessionId ||
          payload.targetUserId === payload.guestUserId
        ) {
          expireCookie(ctx, switchCookie);
          throw ctx.error('FORBIDDEN', { code: GOOGLE_SWITCH_ERRORS.sessionMismatch, message: 'Session does not match switch ticket' }, ctx.responseHeaders);
        }

        const consumed = await adapter.consumeVerificationValue(signedIdentifier);
        if (!consumed) {
          expireCookie(ctx, switchCookie);
          throw ctx.error('BAD_REQUEST', { code: GOOGLE_SWITCH_ERRORS.ticketExpired, message: 'Switch ticket was already used or expired' }, ctx.responseHeaders);
        }

        const targetUser = await adapter.findUserById(payload.targetUserId) as SwitchUserRow | null;
        const googleAccount = await adapter.findAccountByKey({ providerId: 'google', accountId: payload.accountId });
        if (!targetUser || !googleAccount || googleAccount.userId !== targetUser.id) {
          expireCookie(ctx, switchCookie);
          throw ctx.error('CONFLICT', { code: GOOGLE_SWITCH_ERRORS.targetUnavailable, message: 'Target account is no longer available' }, ctx.responseHeaders);
        }

        const newSession = await adapter.createSession(targetUser.id);
        if (!newSession) {
          throw ctx.error('INTERNAL_SERVER_ERROR', { code: GOOGLE_SWITCH_ERRORS.sessionCreateFailed, message: 'Failed to create session' });
        }

        await setSessionCookie(ctx, { session: newSession, user: targetUser as never });
        expireCookie(ctx, switchCookie);
        return ctx.json({ ok: true });
      }),

      cancelGoogleSwitch: createAuthEndpoint('/cancel-google-switch', {
        method: 'POST',
      }, async ctx => {
        ctx.setHeader('cache-control', 'private, no-store');
        if (!isTrustedSwitchOrigin(ctx)) {
          throw ctx.error('FORBIDDEN', { code: 'INVALID_ORIGIN', message: 'Invalid origin' });
        }

        const switchCookie = switchCookieOf(ctx);
        const signedIdentifier = await ctx.getSignedCookie(switchCookie.name, ctx.context.secret);
        if (signedIdentifier) {
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(signedIdentifier);
        }
        expireCookie(ctx, switchCookie);
        return ctx.json({ ok: true });
      }),
    },
    hooks: {
      after: [{
        matcher(ctx) {
          return ctx.path === '/callback/:id';
        },
        handler: createAuthMiddleware(async ctx => {
          const oauthState = await getOAuthState();
          const candidate = takeGoogleSwitchCandidate(oauthState);

          const switchCookie = switchCookieOf(ctx);
          const prevIdentifier = await ctx.getSignedCookie(switchCookie.name, ctx.context.secret);
          if (prevIdentifier) {
            await ctx.context.internalAdapter.deleteVerificationByIdentifier(prevIdentifier);
          }

          if (candidate && redirectErrorCode(ctx) === LINKED_TO_DIFFERENT_USER) {
            const current = await getSessionFromCtx(ctx, { disableCookieCache: true, disableRefresh: true });
            const currentUser = current?.user as SwitchUserRow | undefined;
            if (current && currentUser?.isAnonymous && currentUser.id === candidate.guestUserId && candidate.targetUserId !== currentUser.id) {
              const identifier = `${GOOGLE_SWITCH_IDENTIFIER_PREFIX}${randomBytes(24).toString('base64url')}`;
              const payload: SwitchTicketPayload = {
                guestUserId: currentUser.id,
                guestSessionId: current.session.id,
                targetUserId: candidate.targetUserId,
                accountId: candidate.accountId,
              };
              await ctx.context.internalAdapter.createVerificationValue({
                identifier,
                value: JSON.stringify(payload),
                expiresAt: new Date(Date.now() + GOOGLE_SWITCH_TTL_SEC * 1000),
              });
              await ctx.setSignedCookie(switchCookie.name, identifier, ctx.context.secret, switchCookie.attributes);
              return;
            }
          }

          if (prevIdentifier || ctx.getCookie(switchCookie.name)) {
            expireCookie(ctx, switchCookie);
          }
        }),
      }],
    },
  };
}
