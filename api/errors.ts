// 서버 실패 표현 
// 실패한 곳은 던지기만 한다 — 응답 변환은 핸들러 최상단 한 곳(api/action.ts)이 맡는다.
// 덕분에 본문이 "인증 → 로드 → 규칙 실행 → 저장 → 응답" 직선으로 읽힌다.
export class ApiError extends Error {
  // 생성자 파라미터 프로퍼티 금지 (erasableSyntaxOnly) — 명시 필드
  readonly status: number;
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(status: number, code: string, context: Record<string, unknown> = {}, options?: { cause?: unknown }) {
    super(code, options);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.context = context;
  }
}

/** 알 수 없는 예외는 500 — 정상 프로토콜 응답(4xx)과 구분해야 Sentry 노이즈가 안 생긴다 */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  return new ApiError(500, 'internal', {}, { cause: e });
}
