// 서버 응답의 상태를 실패 종류로 바꾼다. 읽기·쓰기 어댑터가 공유하는 단일 판정이다.
// 인그레스의 요청 한도 응답(429)은 본문이 JSON이 아니므로 본문을 읽지 않고 상태만 본다.
import { AppError } from '../../core/errors';

export const CONSENT_REQUIRED_CODE = 'consent-required' as const;

/** 이용약관 수락이 필요한 계정의 403/WS 1008 거부 오류 */
export class ConsentRequiredError extends AppError {
  readonly code = CONSENT_REQUIRED_CODE;

  constructor(message: string, context: Record<string, unknown> = {}) {
    super('consent-required', message, { ...context, code: CONSENT_REQUIRED_CODE });
    this.name = 'ConsentRequiredError';
  }
}

export function isConsentRequiredError(e: unknown): e is ConsentRequiredError {
  return e instanceof ConsentRequiredError
    || (e instanceof AppError && (e.kind === CONSENT_REQUIRED_CODE || e.context.code === CONSENT_REQUIRED_CODE));
}

type ConsentListener = () => void;
const consentListeners = new Set<ConsentListener>();

/** 약관 확인이 필요해 요청/실시간 연결이 거부됐을 때 알림을 받는다 */
export function subscribeConsentRequired(fn: ConsentListener): () => void {
  consentListeners.add(fn);
  return () => { consentListeners.delete(fn); };
}

export function notifyConsentRequired(): void {
  for (const fn of consentListeners) {
    try { fn(); } catch { /* 한 구독자의 예외가 다른 구독자 전달을 막지 않는다 */ }
  }
}

export function unauthorizedError(message: string): AppError {
  return new AppError('unauthorized', message);
}

export function networkError(message: string, cause?: unknown): AppError {
  return new AppError('network', message, {}, cause === undefined ? undefined : { cause });
}

export function serverError(message: string, context: Record<string, unknown> = {}): AppError {
  return new AppError('server', message, context);
}

export function rateLimitedError(message: string, context: Record<string, unknown> = {}): AppError {
  return new AppError('rate-limited', message, { status: 429, ...context });
}

/** 응답이 요청 한도 초과인가 */
export function isRateLimited(res: Response): boolean {
  return res.status === 429;
}

/** 실패한 응답의 AppError. 429는 rate-limited, 403 consent-required는 ConsentRequiredError, 그 밖은 network다 */
export function requestFailure(res: Response, message: string, code?: string): AppError {
  if (res.status === 403 && code === CONSENT_REQUIRED_CODE) {
    return new ConsentRequiredError(message, { status: res.status });
  }
  return new AppError(isRateLimited(res) ? 'rate-limited' : 'network', message, { status: res.status });
}

/** 403 응답 본문의 error 코드가 consent-required인지 확인한다 */
export async function readConsentRequired(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  const body = await res.clone().json().catch(() => null) as { error?: unknown } | null;
  return body?.error === CONSENT_REQUIRED_CODE;
}

/** 약관 확인 구독자에 알린 뒤 ConsentRequiredError를 던진다 */
export function throwConsentRequired(message: string, context: Record<string, unknown> = {}): never {
  notifyConsentRequired();
  throw new ConsentRequiredError(message, context);
}

/** 비동기 읽기 어댑터용 실패 판정. 403 응답만 본문의 error 코드를 확인해 consent-required를 구분한다 */
export async function readRequestFailure(res: Response, message: string): Promise<AppError> {
  if (await readConsentRequired(res)) {
    return requestFailure(res, message, CONSENT_REQUIRED_CODE);
  }
  return requestFailure(res, message);
}

/** 비동기 어댑터용 실패 처리 — consent-required면 약관 확인 구독자에 알린 뒤 예외를 던진다 */
export async function throwRequestFailure(res: Response, message: string): Promise<never> {
  const err = await readRequestFailure(res, message);
  if (isConsentRequiredError(err)) notifyConsentRequired();
  throw err;
}
