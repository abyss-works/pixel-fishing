import { useQueryClient } from '@tanstack/react-query';
import { useAdminAuth } from './accessContext';
import { readAdminDailyStats, readAdminHttpMetrics, readAdminLive, readAdminOnboardingFunnel, readAdminOverview, readAdminRetention, readAdminSessions, readAdminUsers } from './queries';
import { adminKeys } from './queryKeys';
import { useAdminQuery } from './useAdminQuery';
import type { AdminQuery } from './useAdminQuery';
import type { AdminDailyStatsRow, AdminHttpMetrics, AdminLive, AdminOnboardingFunnel, AdminOverview, AdminRetentionRow, AdminSessionRow, AdminUserAggregates, AdminUserRow } from '../model/types';

// 운영 지표 조회 — 개요 통합, 일별 집계, 실시간 접속, 코호트 리텐션, 접속 세션. 관리자 판정이 granted일 때만 서버에 읽는다.
// 개요 통합 조회가 성공하면 정규 캐시 키(users·spamFlags·live·retention·dailyStats·sessions)를 채워
// 다른 탭으로 이동할 때 중복 풀스캔이 나지 않게 한다.

const useGranted = () => useAdminAuth().access === 'granted';
const NO_USERS: AdminUserRow[] = [];

/** 개요 탭 통합 조회. 도착 시 공유 캐시 키를 함께 채워 탭 전환 시 중복 조회를 0으로 줄인다 */
export function useAdminOverview(days = 30, enabledOverride = true): AdminQuery<AdminOverview> {
  const client = useQueryClient();
  return useAdminQuery(
    adminKeys.overview(days),
    async () => {
      const data = await readAdminOverview(days);
      client.setQueryData(adminKeys.users, data.users);
      client.setQueryData(adminKeys.spamFlags, data.spamFlags);
      client.setQueryData(adminKeys.recentEvents, data.recentEvents);
      client.setQueryData(adminKeys.live, data.live);
      client.setQueryData(adminKeys.dailyStats(days), data.dailyStats);
      client.setQueryData(adminKeys.retention, data.retention);
      client.setQueryData(adminKeys.sessions(null, 500), data.sessions);
      return data;
    },
    useGranted() && enabledOverride,
  );
}

/**
 * 경제·진행 탭용 사용자·사전 집계 조회.
 * maintainer는 명부 수치 필드가 비식별화(null)되므로 overview의 userAggregates를 단일 출처로 쓰고,
 * admin은 기존 users 조회를 유지하되 캐시된 overview가 더 최신이거나 같으면 userAggregates를 함께 전달한다.
 */
export function useAdminAggregateUsers(): {
  users: AdminUserRow[];
  userAggregates: AdminUserAggregates | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const { access, role } = useAdminAuth();
  const granted = access === 'granted';
  const isMaintainer = role === 'maintainer';

  const overview = useAdminOverview(30, granted && isMaintainer);
  const usersQuery = useAdminQuery(adminKeys.users, readAdminUsers, granted && !isMaintainer);

  if (isMaintainer) {
    return {
      users: overview.data?.users ?? NO_USERS,
      userAggregates: overview.data?.userAggregates ?? null,
      loading: overview.loading,
      error: overview.error,
      refresh: overview.refresh,
    };
  }

  const useOverviewAggregates = Boolean(
    overview.data?.userAggregates && overview.updatedAt >= usersQuery.updatedAt,
  );

  return {
    users: usersQuery.data ?? NO_USERS,
    userAggregates: useOverviewAggregates ? (overview.data?.userAggregates ?? null) : null,
    loading: usersQuery.loading,
    error: usersQuery.error,
    refresh: usersQuery.refresh,
  };
}

/** 실시간 접속. pollMs를 주면 그 간격으로 다시 읽는다 */
export function useAdminLive(pollMs?: number): AdminQuery<AdminLive> {
  return useAdminQuery(adminKeys.live, readAdminLive, useGranted(), pollMs);
}

/** 오늘(KST)까지 최근 days일의 일별 집계. enabledOverride로 중복 조회를 끌 수 있다 */
export function useAdminDailyStats(days: number, enabledOverride = true): AdminQuery<AdminDailyStatsRow[]> {
  return useAdminQuery(adminKeys.dailyStats(days), () => readAdminDailyStats(days), useGranted() && enabledOverride);
}

export function useAdminRetention(): AdminQuery<AdminRetentionRow[]> {
  return useAdminQuery(adminKeys.retention, readAdminRetention, useGranted());
}

/** 끝난 접속 세션(최근 순) limit건. userId가 null이면 모든 사람의 기록이다 */
export function useAdminSessions(userId: string | null, limit: number): AdminQuery<AdminSessionRow[]> {
  return useAdminQuery(adminKeys.sessions(userId, limit),
    () => readAdminSessions(userId ?? undefined, limit), useGranted());
}

/** 온보딩 퍼널 조회 */
export function useAdminOnboardingFunnel(): AdminQuery<AdminOnboardingFunnel> {
  return useAdminQuery(adminKeys.onboardingFunnel, readAdminOnboardingFunnel, useGranted());
}

/** 앱 서버 HTTP 오류율·429 지표 조회 */
export function useAdminHttpMetrics(days = 30): AdminQuery<AdminHttpMetrics> {
  return useAdminQuery(adminKeys.httpMetrics(days), () => readAdminHttpMetrics(days), useGranted());
}
