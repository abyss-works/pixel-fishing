import { useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 읽기 캐시 루트 — 애플리케이션 읽기 요청을 위한 쿼리 캐시를 제공한다.
// 게임이라 보수 기본값: 포커스·재연결 리패치 없음(소음).
// 재시도는 아직 재시도되지 않은 429(요청 과다)에만 제한적으로 허용하며 401/403 등 권한·요청 오류는 즉시 실패한다.
// 쓰기(dispatch)는 RQ를 거치지 않는다 — 서버 권위 단일 경로 유지.
interface RateLimitErrorShape {
  status?: unknown;
  retried?: unknown;
  retryAfterMs?: unknown;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          const e = error as RateLimitErrorShape | null;
          if (!e || e.status !== 429 || e.retried === true) return false;
          return failureCount < 2;
        },
        retryDelay: (attemptIndex, error) => {
          const raw = (error as RateLimitErrorShape | null)?.retryAfterMs;
          if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.min(raw, 10_000);
          return Math.min(500 * 2 ** attemptIndex, 4_000);
        },
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
