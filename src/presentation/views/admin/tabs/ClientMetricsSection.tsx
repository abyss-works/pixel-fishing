// 클라이언트 체감 성능, RTT, 프레임, 소켓 재연결 섹션 — 요약 보기에서는 오류·이탈 요약 카드만, 상세 보기에서는 8 KPI와 11열 일별 표를 보여준다.
import { useEffect, useMemo, useRef } from 'react';
import Badge from '../../../ui/Badge';
import DataTable from '../../../ui/DataTable';
import Inset from '../../../ui/Inset';
import Note from '../../../ui/Note';
import {
  CLIENT_METRICS_SCOPE_NOTICE,
  selectClientMetricsView,
} from '../../../../features/admin/model/clientMetrics';
import { fmtNum } from '../../../../features/admin/model/metrics';
import { useAdminClientMetrics } from '../../../../features/admin/service/useAdminStats';
import { AdminCard, AdminKpiCard, AdminKpiGrid, AdminQueueItem, AdminTableWrap, TabState } from '../layout';
import type { AdminViewMode } from '../viewMode';

/** 운영 탭용 클라이언트 체감 성능 및 단절 카드 (기간·새로고침은 OpsTab이 제어한다) */
export default function ClientMetricsSection({
  granted,
  days = 7,
  refreshSignal = 0,
  mode = 'detail',
}: {
  granted: boolean;
  days?: number;
  refreshSignal?: number;
  mode?: AdminViewMode;
}) {
  const { data, loading, error, refresh } = useAdminClientMetrics(days);
  const view = useMemo(() => selectClientMetricsView(data, days), [data, days]);
  const lastSignalRef = useRef(refreshSignal);

  useEffect(() => {
    if (refreshSignal !== lastSignalRef.current) {
      lastSignalRef.current = refreshSignal;
      refresh();
    }
  }, [refreshSignal, refresh]);

  if (mode === 'summary') {
    return (
      <AdminCard
        title={`클라이언트 오류·체감 요약 (최근 ${days}일)`}
        badge={<Badge tone="dim" size="2xs">{`보고 ${fmtNum(view.reports)}건`}</Badge>}
      >
        <div className="flex flex-col gap-3">
          {((loading && granted) || error) && (
            <TabState loading={loading && granted} error={error} onRetry={refresh} />
          )}
          <div className="pf-admin-queue-list">
            <AdminQueueItem tone={view.ws.abnormalCloses > 0 ? 'warn' : 'default'}>
              <div>
                <div className="text-xs font-medium text-text">WebSocket 재연결 및 비정상 종료</div>
                <div className="text-2xs text-text-dim">실시간 연결 이탈과 재접속 빈도</div>
              </div>
              <Badge tone={view.ws.abnormalCloses > 0 ? 'orange' : 'accent'} size="xs">
                {`${fmtNum(view.ws.reconnects)} / ${fmtNum(view.ws.abnormalCloses)}건`}
              </Badge>
            </AdminQueueItem>
            <AdminQueueItem>
              <div>
                <div className="text-xs font-medium text-text">렌더 긴 프레임 비율</div>
                <div className="text-2xs text-text-dim">{`${fmtNum(view.canvas.longFrames)} / ${fmtNum(view.canvas.frames)} 프레임`}</div>
              </div>
              <Badge tone="dim" size="xs">{view.canvas.longFramePctText}</Badge>
            </AdminQueueItem>
            <AdminQueueItem>
              <div>
                <div className="text-xs font-medium text-text">요청 타임아웃 및 409 재시도</div>
                <div className="text-2xs text-text-dim">{`액션 타임아웃 ${fmtNum(view.actionRtt.timeouts)} / 조회 ${fmtNum(view.meRtt.timeouts)}`}</div>
              </div>
              <Badge tone="dim" size="xs">{`409 ${fmtNum(view.actionRtt.conflicts409)}건`}</Badge>
            </AdminQueueItem>
            <AdminQueueItem>
              <div>
                <div className="text-xs font-medium text-text">핵심 체감 지연 (LCP / 액션 p95)</div>
                <div className="text-2xs text-text-dim">실제 브라우저 세션 비콘 기준</div>
              </div>
              <Badge tone="accent" size="xs">{`${view.lcp.p95Text} / ${view.actionRtt.p95Text}`}</Badge>
            </AdminQueueItem>
          </div>
          {!granted && (
            <Note size="2xs" className="my-0">운영 DB에 연결하면 클라이언트 요약 지표가 채워져요.</Note>
          )}
        </div>
      </AdminCard>
    );
  }

  return (
    <AdminCard title="클라이언트 체감 성능 및 단절">
      <div className="flex flex-col gap-3">
        <Note size="2xs" className="my-0">{CLIENT_METRICS_SCOPE_NOTICE}</Note>

        {((loading && granted) || error) && (
          <TabState loading={loading && granted} error={error} onRetry={refresh} />
        )}

        <AdminKpiGrid cols={4}>
          <AdminKpiCard
            label="LCP p95"
            value={view.lcp.p95Text}
            sub={`p50 ${view.lcp.p50Text} / 평균 ${view.lcp.avgText} (표본 ${fmtNum(view.lcp.samples)}건)`}
          />
          <AdminKpiCard
            label="INP p95"
            value={view.inp.p95Text}
            sub={`p50 ${view.inp.p50Text} / 평균 ${view.inp.avgText} (표본 ${fmtNum(view.inp.samples)}건)`}
          />
          <AdminKpiCard label="CLS 평균" value={view.clsText} sub="누적 레이아웃 이동" />
          <AdminKpiCard
            label="TTFB p95"
            value={view.ttfb.p95Text}
            sub={`p50 ${view.ttfb.p50Text} / 평균 ${view.ttfb.avgText} (표본 ${fmtNum(view.ttfb.samples)}건)`}
          />
        </AdminKpiGrid>

        <AdminKpiGrid cols={4}>
          <AdminKpiCard
            label="액션 RTT p95"
            value={view.actionRtt.p95Text}
            sub={`p50 ${view.actionRtt.p50Text} / 평균 ${view.actionRtt.avgText}`}
          />
          <AdminKpiCard
            label="조회 RTT p95"
            value={view.meRtt.p95Text}
            sub={`p50 ${view.meRtt.p50Text} / 평균 ${view.meRtt.avgText}`}
          />
          <AdminKpiCard
            label="긴 프레임 비율"
            value={view.canvas.longFramePctText}
            sub={`긴 프레임 ${fmtNum(view.canvas.longFrames)} / ${fmtNum(view.canvas.frames)}`}
          />
          <AdminKpiCard
            label="WS 재연결 / 비정상"
            value={`${fmtNum(view.ws.reconnects)} / ${fmtNum(view.ws.abnormalCloses)}`}
            sub="재연결 / 비정상 종료"
          />
        </AdminKpiGrid>

        <Inset className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              수집 보고 <strong className="pf-accent text-gold">{fmtNum(view.reports)}건</strong>
            </span>
            <span>
              타임아웃 (액션 {fmtNum(view.actionRtt.timeouts)} / 조회 {fmtNum(view.meRtt.timeouts)})
            </span>
            <span>
              409 재시도 <strong className="pf-accent text-gold">{fmtNum(view.actionRtt.conflicts409)}건</strong>
            </span>
          </div>
          <span className="text-text-dim">
            긴 프레임 ({fmtNum(view.canvas.longFrames)} / {fmtNum(view.canvas.frames)})
          </span>
        </Inset>

        {view.daily.length === 0 ? (
          <Note size="2xs" className="my-0">수집된 클라이언트 성능 지표가 아직 없어요.</Note>
        ) : (
          <AdminTableWrap scroll>
            <DataTable aria-label="일별 클라이언트 체감 성능" className="pf-admin-table">
              <thead>
                <tr>
                  <th className="text-left">일자</th>
                  <th className="text-right">보고 수</th>
                  <th className="text-right">LCP p95</th>
                  <th className="text-right">INP p95</th>
                  <th className="text-right">TTFB p95</th>
                  <th className="text-right">CLS</th>
                  <th className="text-right">액션 p95</th>
                  <th className="text-right">조회 p95</th>
                  <th className="text-right">긴 프레임율</th>
                  <th className="text-right">409 재시도</th>
                  <th className="text-right">WS 재연결</th>
                </tr>
              </thead>
              <tbody>
                {view.daily.map(row => (
                  <tr key={row.day}>
                    <td className="text-xs whitespace-nowrap">{row.day}</td>
                    <td className="text-right">{fmtNum(row.reports)}</td>
                    <td className="text-right pf-accent text-gold">{row.lcpP95Text}</td>
                    <td className="text-right">{row.inpP95Text}</td>
                    <td className="text-right">{row.ttfbP95Text}</td>
                    <td className="text-right">{row.clsText}</td>
                    <td className="text-right">{row.actionP95Text}</td>
                    <td className="text-right">{row.meP95Text}</td>
                    <td className="text-right">{row.longFramePctText}</td>
                    <td className="text-right">{fmtNum(row.conflicts409)}</td>
                    <td className="text-right">{fmtNum(row.wsReconnects)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </AdminTableWrap>
        )}
      </div>
    </AdminCard>
  );
}
