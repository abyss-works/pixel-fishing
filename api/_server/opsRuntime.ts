// 운영 관측 런타임 조회 게터 — 프로세스 기동 시 수집기 게터를 등록하고 관리자 핸들러가 진입점과 결합 없이 읽는다.
import type { HttpMetricsCounts } from '../_data/httpMetrics.js';
import type { WsMetricsCounts } from '../_data/wsMetrics.js';
import type { SlowHttpRequest } from './httpMetrics.js';

let slowRequestsProvider: () => SlowHttpRequest[] = () => [];
let recentHttpProvider: () => HttpMetricsCounts | null = () => null;
let recentWsProvider: () => WsMetricsCounts | null = () => null;

export function provideSlowRequests(fn: () => SlowHttpRequest[]): void {
  slowRequestsProvider = fn;
}

/** 최근 임계 지연 초과 요청 목록(비식별)을 돌려준다 */
export function slowRequests(): SlowHttpRequest[] {
  return slowRequestsProvider();
}

export function provideRecentHttpSummary(fn: () => HttpMetricsCounts | null): void {
  recentHttpProvider = fn;
}

/** 최근 창 기준 HTTP 응답 요약을 돌려준다. 수집기 미등록 시 null */
export function recentHttpSummary(): HttpMetricsCounts | null {
  return recentHttpProvider();
}

export function provideRecentWsSnapshot(fn: () => WsMetricsCounts | null): void {
  recentWsProvider = fn;
}

/** 최근 창 기준 WebSocket 지표 요약을 돌려준다. 수집기 미등록 시 null */
export function recentWsSnapshot(): WsMetricsCounts | null {
  return recentWsProvider();
}
