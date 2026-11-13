// 수락 전 게임 요청 거부 — 확인이 필요한 계정(게스트가 아니고 현재 판의 수락 기록이 없고 시행일이 지난 계정)의 요청을 consent-required로 막는다.
// 허용 목록 방식이다. 아래 경로가 아닌 /api 경로는 모두 게임 요청으로 보고 막는다.
import type { RequestHandler } from 'express';
import { consentPolicy } from '../_auth/consentPolicy.js';
import { sessionOf } from '../_auth/session.js';
import { consentRequiredFor } from '../_data/consent.js';
import { database } from '../_db/client.js';
import { toApiError } from '../errors.js';
import { reportServerIssue } from '../observability.js';

/**
 * 확인이 필요한 계정도 쓸 수 있는 경로(마디 단위 앞부분).
 * - 계정: 계정 정보 조회, 수락 요청, 탈퇴
 * - 인증: 로그인과 로그아웃
 * - 관리자 대시보드: 게임 세션이 아니라 별도 관리자 세션으로 인증하는 경로
 * - 예약 작업: 서버 비밀값으로 인증하고 사용자 세션이 없는 경로
 * - 길드 초대 미리보기: 로그인 없이 열리는 읽기 경로. 가입 요청은 길드 가입 경로이므로 막힌다
 */
export const CONSENT_EXEMPT_PATHS: readonly string[] = [
  '/api/account', '/api/auth', '/api/admin', '/api/cron', '/api/guild-invites',
];

/** 이 경로가 확인이 필요한 계정에게도 열려 있는가 */
export function isConsentExempt(path: string): boolean {
  return CONSENT_EXEMPT_PATHS.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * 게임 요청의 수락 확인. 시행일 전에는 세션도 읽지 않고 통과시킨다.
 * 세션이 없으면 통과시켜 각 핸들러의 401 응답에 맡긴다.
 */
export function consentGate(): RequestHandler {
  return (req, res, next) => {
    const path = `${req.baseUrl}${req.path}`;
    const check = async (): Promise<boolean> => {
      if (isConsentExempt(path)) return false;
      const policy = consentPolicy();
      const now = new Date();
      if (now.getTime() < policy.effectiveAt.getTime()) return false;
      const session = await sessionOf(req.headers);
      if (!session) return false;
      return consentRequiredFor(database().db, { uid: session.id, guest: session.email === null }, policy, now);
    };
    check().then(async rejected => {
      if (!rejected) { next(); return; }
      res.status(403).json({ error: 'consent-required' });
    }, async (e: unknown) => {
      const err = toApiError(e);
      if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
      res.status(err.status).json({ error: err.code });
    });
  };
}

/** 실시간 채널 접속의 수락 확인. 확인이 필요한 계정의 접속은 받지 않는다 */
export async function liveConsentAdmit(user: { uid: string; guest: boolean }): Promise<boolean> {
  return !await consentRequiredFor(database().db, user, consentPolicy(), new Date());
}
