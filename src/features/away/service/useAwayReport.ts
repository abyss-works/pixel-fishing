import { useCallback, useEffect, useRef, useState } from 'react';
import { liveAvailable, readAwayReport, watchAway } from '../../../platform/api';
import { awayReportDue } from '../../../game/rules/away';
import type { AwaySummary } from '../../../game/rules/away';

/** 서버 방치 큐를 사용할 수 있는 환경(클라우드 모드)인지 여부 */
export const serverIdleAvailable = liveAvailable;

export interface AwayReportOptions {
  /** 복귀 또는 초기 접속 시 서버 방치 큐를 소모하고 최신 요약을 돌려준다 */
  settleIdle?: (keepActive: boolean) => Promise<AwaySummary | null>;
  /** 초기 상태 로드가 끝났을 때 true (기본 true) */
  ready?: boolean;
}

/**
 * 방치 결과 보고 — 결과 카드를 띄울 만큼 오래 자리를 비웠다 돌아오면 서버 방치 큐를 소모한 뒤 요약을 읽는다.
 * 모바일 브라우저 완전 종료 뒤 재접속(초기 로드)에서도 미소모 큐를 자동 소모해 결과를 알린다.
 * 잡은 물고기가 있으면 onLine으로 메시지 창 한 줄을 남기고 report로 내준다. 화면이 dismiss로 내린다.
 */
export function useAwayReport(
  onLine: (summary: AwaySummary, hasCard: boolean) => void,
  options?: AwayReportOptions,
): { report: AwaySummary | null; dismiss: () => void } {
  const [report, setReport] = useState<AwaySummary | null>(null);
  const lineRef = useRef(onLine);
  const settleRef = useRef(options?.settleIdle);
  const bootSettledRef = useRef(false);
  useEffect(() => {
    lineRef.current = onLine;
    settleRef.current = options?.settleIdle;
  });

  const ready = options?.ready ?? true;

  // 모바일 브라우저 완전 종료·새로고침 뒤 초기 로드 시 서버 미소모 방치 큐를 1회 자동 소모한다
  useEffect(() => {
    if (!ready || bootSettledRef.current || !settleRef.current) return;
    bootSettledRef.current = true;
    void settleRef.current(false).then(summary => {
      if (!summary || summary.catches === 0 || !awayReportDue(summary.awayMs)) return;
      lineRef.current(summary, true);
      setReport(summary);
    }).catch(() => { /* 초기 정산 실패는 게임 진행을 막지 않는다 */ });
  }, [ready]);

  useEffect(() => watchAway(awayMs => {
    if (!awayReportDue(awayMs)) return;
    const run = async () => {
      const settled = settleRef.current
        ? await settleRef.current(true).catch(() => null)
        : null;
      const fromEvents = await readAwayReport(awayMs).catch(() => null);
      const summary = (fromEvents && fromEvents.catches > 0)
        ? fromEvents
        : (settled && settled.catches > 0 ? settled : null);
      if (!summary) return;
      lineRef.current(summary, true);
      setReport(summary);
    };
    void run();
  }), []);

  const dismiss = useCallback(() => setReport(null), []);
  return { report, dismiss };
}
