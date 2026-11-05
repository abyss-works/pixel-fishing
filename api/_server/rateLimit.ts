// 요청 수 제한 — 키(접속 주소 등)마다 고정 창 안의 요청 수를 센다. 한 프로세스의 메모리에만 둔다.
// 길드 미리보기처럼 로그인 없이 열리는 경로에서 코드 추측을 막는 데 쓴다.
import type { IncomingMessage } from 'node:http';

export interface RateLimiter {
  /** 이번 요청을 받아도 되는가. 받으면 센다 */
  take(key: string, now: number): boolean;
}

export function createRateLimiter(opts: { windowMs: number; max: number }): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    take(key, now) {
      const w = windows.get(key);
      if (!w || now - w.start >= opts.windowMs) {
        // 창이 바뀔 때 끝난 창을 함께 비워 키가 쌓이지 않게 한다
        for (const [k, v] of windows) if (now - v.start >= opts.windowMs) windows.delete(k);
        windows.set(key, { start: now, count: 1 });
        return true;
      }
      if (w.count >= opts.max) return false;
      w.count += 1;
      return true;
    },
  };
}

/** 요청한 쪽의 주소. 인그레스가 붙인 X-Forwarded-For의 첫 주소를 쓰고, 없으면 소켓 주소다 */
export function clientKey(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || 'unknown';
}
