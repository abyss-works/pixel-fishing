import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Query } from '@tanstack/react-query';

// 관리자 탭 공통 조회 — 수동 useState·useEffect 조회를 RQ로 옮긴다.
// 반환형은 수동 조회 시절과 같다: data(없으면 null) · loading · error(문구) · refresh.
// granted 전에는 조회하지 않는다(빈 골격) — enabled가 그 계약을 그대로 받는다.
// 공유 키(users·spamFlags 등)는 30초 staleTime을 적용해 탭 전환 시 중복 풀스캔을 막는다.
export const ADMIN_STALE_TIME_MS = 30_000;
const REFRESH_COOLDOWN_MS = 1_500;

export interface AdminQuery<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** 지금 data가 도착한 시각(ms). 도착 전이면 0 */
  updatedAt: number;
  refresh: () => void;
}

export function useAdminQuery<T>(
  key: readonly unknown[],
  read: () => Promise<T>,
  enabled: boolean,
  refetchInterval?: number,
  staleTime: number = ADMIN_STALE_TIME_MS,
): AdminQuery<T> {
  const q = useQuery({ queryKey: key, queryFn: read, enabled, refetchInterval, staleTime });
  return {
    data: q.data ?? null,
    // 도착 전과 재조회 중을 모두 loading으로 본다 — 수동 훅의 시작값 true와 같은 계약이다
    loading: q.isPending || q.isFetching,
    error: q.error ? String((q.error as { message?: unknown }).message ?? q.error) : null,
    updatedAt: q.dataUpdatedAt,
    refresh: () => { void q.refetch(); },
  };
}

const isActiveDataQuery = (query: Query): boolean =>
  Array.isArray(query.queryKey)
  && query.queryKey[0] === 'admin'
  && query.queryKey[1] !== 'access'
  && query.queryKey[1] !== 'signInReturn'
  && query.getObserversCount() > 0;

/** 현재 열린 탭의 활성 관리자 데이터 조회를 일괄 재조회하고 마지막 조회 시각을 추적한다. 연타 방지 쿨다운을 적용한다 */
export function useAdminRefresh(enabled: boolean): {
  refreshing: boolean;
  lastUpdatedAt: number;
  refresh: () => void;
} {
  const client = useQueryClient();
  const refreshingCount = useIsFetching({ predicate: isActiveDataQuery });
  const cache = client.getQueryCache();
  const lastManualRefreshRef = useRef(0);

  const subscribe = useCallback((onStoreChange: () => void) => cache.subscribe(onStoreChange), [cache]);
  const getSnapshot = useCallback(() => {
    let maxUpdated = 0;
    for (const q of cache.getAll()) {
      if (isActiveDataQuery(q) && q.state.dataUpdatedAt > maxUpdated) {
        maxUpdated = q.state.dataUpdatedAt;
      }
    }
    return maxUpdated;
  }, [cache]);

  const lastUpdatedAt = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const refresh = useCallback(() => {
    if (!enabled || refreshingCount > 0) return;
    const now = Date.now();
    if (now - lastManualRefreshRef.current < REFRESH_COOLDOWN_MS) return;
    lastManualRefreshRef.current = now;
    void client.invalidateQueries({ predicate: isActiveDataQuery, refetchType: 'active' });
  }, [client, enabled, refreshingCount]);

  return {
    refreshing: refreshingCount > 0,
    lastUpdatedAt,
    refresh,
  };
}
