import { useQuery } from '@tanstack/react-query';

// 관리자 탭 공통 조회 — 수동 useState·useEffect 조회를 RQ로 옮긴다.
// 반환형은 수동 조회 시절과 같다: data(없으면 null) · loading · error(문구) · refresh.
// granted 전에는 조회하지 않는다(빈 골격) — enabled가 그 계약을 그대로 받는다.
// 실패는 재시도 없이 한 문구로 수렴한다(QueryProvider 기본값 retry: false).
export interface AdminQuery<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAdminQuery<T>(
  key: readonly unknown[],
  read: () => Promise<T>,
  enabled: boolean,
  refetchInterval?: number,
): AdminQuery<T> {
  const q = useQuery({ queryKey: key, queryFn: read, enabled, refetchInterval });
  return {
    data: q.data ?? null,
    // 도착 전과 재조회 중을 모두 loading으로 본다 — 수동 훅의 시작값 true와 같은 계약이다
    loading: q.isPending || q.isFetching,
    error: q.error ? String((q.error as { message?: unknown }).message ?? q.error) : null,
    refresh: () => { void q.refetch(); },
  };
}
