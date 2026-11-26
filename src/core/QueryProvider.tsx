import { useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryRetryDelayMs, shouldRetryQuery } from './retryPolicy';

// 읽기 캐시 루트 — 애플리케이션 읽기 요청을 위한 쿼리 캐시를 제공한다.
// 게임이라 보수 기본값: 포커스·재연결 리패치 없음(소음).
// 재시도는 429(Retry-After 존중, 이미 재시도된 것 제외)와 5xx·순단에만 제한적으로 허용하며 4xx 권한·요청 오류는 즉시 실패한다.
// 쓰기(dispatch)는 RQ를 거치지 않는다 — 서버 권위 단일 경로 유지.
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        retryDelay: queryRetryDelayMs,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
