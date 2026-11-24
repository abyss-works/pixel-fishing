import { useCallback, useEffect, useRef, useState } from 'react';
import { readAwayReport, watchAway } from '../../../platform/api';
import { awayReportDue } from '../../../game/rules/away';
import type { AwaySummary } from '../../../game/rules/away';

/**
 * 방치 결과 보고 — 결과 카드를 띄울 만큼 오래 자리를 비웠다 돌아오면 그사이 요약을 읽는다. 잡은 물고기가 있으면
 * onLine으로 메시지 창 한 줄을 남기고 report로 내준다. 화면이 dismiss로 내린다. 카드 기준 미만의 부재는 알리지 않는다.
 */
export function useAwayReport(onLine: (summary: AwaySummary, hasCard: boolean) => void): { report: AwaySummary | null; dismiss: () => void } {
  const [report, setReport] = useState<AwaySummary | null>(null);
  const lineRef = useRef(onLine);
  useEffect(() => { lineRef.current = onLine; });

  useEffect(() => watchAway(awayMs => {
    if (!awayReportDue(awayMs)) return;
    readAwayReport(awayMs).then(summary => {
      if (!summary || summary.catches === 0) return;
      lineRef.current(summary, true);
      setReport(summary);
    }).catch(() => { /* 보고는 놓쳐도 게임 진행에 영향이 없다 — 다음 부재에서 다시 읽는다 */ });
  }), []);

  const dismiss = useCallback(() => setReport(null), []);
  return { report, dismiss };
}
