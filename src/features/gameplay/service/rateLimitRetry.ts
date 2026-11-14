import { AppError } from '../../../core/errors';

// 부팅과 계정 교체의 세이브 읽기, 접속(boot) 액션이 요청 속도 초과(429)를 받았을 때의 재시도.
// 한 곳에 모아 두 흐름이 같은 대기와 횟수를 쓰게 한다.

/** 다시 시도하기 전의 대기(밀리초). 길이가 곧 다시 시도하는 최대 횟수다 */
export const RATE_LIMIT_RETRY_MS = [1000, 2000, 4000] as const;

const EXHAUSTED = 'rateLimitRetries';

/** 재시도를 다 쓰고도 실패했는가 */
export function isRetryExhausted(e: unknown): boolean {
  return e instanceof AppError && e.context[EXHAUSTED] === RATE_LIMIT_RETRY_MS.length;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('aborted', 'AbortError')); return; }
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * run이 rate-limited로 실패하면 대기 뒤 다시 시도한다. 다른 실패는 그대로 던진다.
 * 재시도를 다 쓰고도 429면 다른 세이브 읽기 실패와 같은 network 실패로 던진다(저장 실패 안내 창).
 * signal이 중단되면 대기를 끊고 AbortError(DOMException)로 던진다.
 */
export async function retryOnRateLimit<T>(run: () => Promise<T> | T, signal: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      if (!(e instanceof AppError) || e.kind !== 'rate-limited') throw e;
      if (attempt >= RATE_LIMIT_RETRY_MS.length) {
        throw new AppError('network', 'rate limited after retries',
          { ...e.context, [EXHAUSTED]: RATE_LIMIT_RETRY_MS.length }, { cause: e });
      }
      await sleep(RATE_LIMIT_RETRY_MS[attempt], signal);
    }
  }
}
