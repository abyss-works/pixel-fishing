import { useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 읽기 캐시 루트 — 애플리케이션 읽기 요청을 위한 쿼리 캐시를 제공한다.
// 게임이라 보수 기본값: 재시도 없음(실패는 null UI), 포커스·재연결 리패치 없음(소음).
// 쓰기(dispatch)는 RQ를 거치지 않는다 — 서버 권위 단일 경로 유지.
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
