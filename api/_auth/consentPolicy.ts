// 약관과 개인정보 처리방침의 현재 판. 판은 시행일 날짜 문자열이고, 서버는 이 모듈이 정한 값만 쓴다.
// 시행일은 서버 설정이며 기본값이 없다. 설정이 없거나 날짜가 아니면 서버가 기동하지 않는다.
import { ApiError } from '../errors.js';

/** 수락을 받는 문서. 한 번의 수락이 두 문서를 함께 기록한다 */
export const CONSENT_DOCUMENTS = ['terms', 'privacy'] as const;
export type ConsentDocument = (typeof CONSENT_DOCUMENTS)[number];

/** 수락 경로. 구글 연결 화면의 고지, 시행 뒤 첫 접속의 확인 화면 */
export type ConsentChannel = 'google-link' | 'confirm-screen';

export interface ConsentPolicy {
  /** 현재 판. 시행일의 `YYYY-MM-DD` 문자열이다 */
  version: string;
  /** 시행 시각. 시행일 UTC 0시이며, 이 시각부터 확인이 필요한 계정의 게임 요청을 거부한다 */
  effectiveAt: Date;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 시행일 설정 값을 현재 판으로 바꾼다. 실제 달력에 없는 날짜와 다른 형식은 실패한다 */
export function parseConsentPolicy(raw: string | undefined): ConsentPolicy {
  const effectiveAt = raw !== undefined && DATE.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : null;
  if (!raw || !effectiveAt || Number.isNaN(effectiveAt.getTime()) || effectiveAt.toISOString().slice(0, 10) !== raw) {
    throw new ApiError(500, 'server-config');
  }
  return { version: raw, effectiveAt };
}

/** 서버 설정(CONSENT_EFFECTIVE_DATE)의 현재 판. 호출할 때마다 설정을 읽는다 */
export function consentPolicy(): ConsentPolicy {
  return parseConsentPolicy(process.env.CONSENT_EFFECTIVE_DATE);
}

/** 지금이 시행 시각 이후인가. 시행 경계(시행일 UTC 0시 포함)를 비교하는 유일한 곳이다 */
export function consentInEffect(policy: ConsentPolicy, now: Date): boolean {
  return now.getTime() >= policy.effectiveAt.getTime();
}

/** 확인이 필요한 계정인가: 게스트가 아니고, 현재 판의 수락 기록이 없고, 시행일이 됐다 */
export function consentRequired(policy: ConsentPolicy, now: Date, who: { guest: boolean; accepted: boolean }): boolean {
  return !who.guest && !who.accepted && consentInEffect(policy, now);
}
