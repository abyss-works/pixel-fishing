import { useAdminAuth } from './accessContext';
import { readAdminDailyStats, readAdminLive, readAdminRetention, readAdminSessions } from './queries';
import { adminKeys } from './queryKeys';
import { useAdminQuery } from './useAdminQuery';
import type { AdminQuery } from './useAdminQuery';
import type { AdminDailyStatsRow, AdminLive, AdminRetentionRow, AdminSessionRow } from '../model/types';

// 운영 지표 조회 — 일별 집계, 실시간 접속, 코호트 리텐션, 접속 세션. 관리자 판정이 granted일 때만 서버에 읽는다.
// 같은 대상을 쓰는 탭은 같은 키를 공유한다(개요와 활동 구역의 일별 집계, 개요와 실시간 탭의 접속 목록).

const useGranted = () => useAdminAuth().access === 'granted';

/** 실시간 접속. pollMs를 주면 그 간격으로 다시 읽는다 */
export function useAdminLive(pollMs?: number): AdminQuery<AdminLive> {
  return useAdminQuery(adminKeys.live, readAdminLive, useGranted(), pollMs);
}

/** 오늘(KST)까지 최근 days일의 일별 집계 */
export function useAdminDailyStats(days: number): AdminQuery<AdminDailyStatsRow[]> {
  return useAdminQuery(adminKeys.dailyStats(days), () => readAdminDailyStats(days), useGranted());
}

export function useAdminRetention(): AdminQuery<AdminRetentionRow[]> {
  return useAdminQuery(adminKeys.retention, readAdminRetention, useGranted());
}

/** 끝난 접속 세션(최근 순) limit건. userId가 null이면 모든 사람의 기록이다 */
export function useAdminSessions(userId: string | null, limit: number): AdminQuery<AdminSessionRow[]> {
  return useAdminQuery(adminKeys.sessions(userId, limit),
    () => readAdminSessions(userId ?? undefined, limit), useGranted());
}
