// 예약 작업 실패 기록 — 실패한 단계와 원인을 error 수준 로그로 남긴다.
// 오류 객체는 바꾸지 않고 단계 이름만 따로 기억한다. 가장 안쪽 단계가 먼저 기록되고 바깥 단계는 덮어쓰지 않는다.
// 쿼리 빌더 오류는 메시지와 스택에 쿼리 인자를 싣는다. 인자 줄은 가리고 SQL 문장만 남긴다.
import { redactQueryParams, redactStackParams } from './_db/errors.js';

const stages = new WeakMap<object, string>();

/** run이 던지는 오류에 단계 이름을 표시하고 같은 오류를 다시 던진다 */
export async function inStage<T>(stage: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (typeof error === 'object' && error !== null && !stages.has(error)) stages.set(error, stage);
    throw error;
  }
}

export function failureStage(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null ? stages.get(error) : undefined;
}

const CAUSE_DEPTH = 3;

interface ErrorSummary { name: string; code?: string; message: string }

function summarize(error: unknown): ErrorSummary {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return { name: error.name, code: typeof code === 'string' ? code : undefined, message: redactQueryParams(error.message) };
  }
  return { name: typeof error, message: redactQueryParams(String(error)) };
}

function causesOf(error: unknown): ErrorSummary[] {
  const causes: ErrorSummary[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < CAUSE_DEPTH; depth += 1) {
    current = current instanceof Error ? current.cause : undefined;
    if (current === undefined) break;
    causes.push(summarize(current));
  }
  return causes;
}

/** 실패를 error 로그 한 줄로 남긴다. 단계 표시가 없으면 fallbackStage를 쓰고, context는 로그 필드에 더한다 */
export function logCronFailure(job: string, error: unknown, fallbackStage: string, context: Record<string, unknown> = {}): void {
  const stage = failureStage(error) ?? fallbackStage;
  try {
    const stack = error instanceof Error && error.stack ? redactStackParams(error.stack) : undefined;
    const fields = { job, stage, ...summarize(error), causes: causesOf(error), ...context, stack };
    console.error(`예약 작업이 실패했습니다 (작업 ${job}, 단계 ${stage})`, JSON.stringify(fields));
  } catch {
    // 문자열로 바꿀 수 없는 값이 던져진 경우에도 뒤따르는 보고와 응답을 막지 않는다
    console.error(`예약 작업이 실패했습니다 (작업 ${job}, 단계 ${stage}). 오류 내용을 기록하지 못했습니다`);
  }
}
