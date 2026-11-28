// 앱 서버 HTTP 오류율·429 지표 — 개요 탭 요약 카드와 운영 탭 상세(경로별·일별 추이)가 공유한다.
import { useEffect, useMemo, useRef } from 'react';
import Badge from '../../../ui/Badge';
import DataTable from '../../../ui/DataTable';
import Inset from '../../../ui/Inset';
import KpiTile from '../../../ui/KpiTile';
import Note from '../../../ui/Note';
import { fmtNum } from '../../../../features/admin/model/metrics';
import { HTTP_SCOPE_NOTICE, selectHttpMetricsView } from '../../../../features/admin/model/httpMetrics';
import type { HttpMetricsView } from '../../../../features/admin/model/httpMetrics';
import { useAdminHttpMetrics } from '../../../../features/admin/service/useAdminStats';
import { BarsChart } from '../charts';
import { AdminCard, AdminKpiCard, AdminKpiGrid, AdminSplit, AdminTableWrap, Cell, KpiRow, TabState } from '../layout';

const fmtCount = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? '--' : fmtNum(v);

function HttpSummaryKpis({ view, days }: { view: HttpMetricsView; days: number }) {
  const { summary } = view;
  return (
    <KpiRow>
      <KpiTile label="앱 서버 총 요청" value={fmtCount(summary.total)} hint={`최근 ${days}일 통과 요청`} />
      <KpiTile label="5xx 서버 오류" value={summary.rate5xxText} hint={`${fmtCount(summary.status5xx)}건`} />
      <KpiTile label="429 레이트리밋" value={summary.rate429Text} hint={`${fmtCount(summary.status429)}건`} />
      <KpiTile label="426 구버전 거부" value={summary.rate426Text} hint={`${fmtCount(summary.status426)}건`} />
    </KpiRow>
  );
}

/** 개요 탭용 HTTP 오류율·429 핵심 요약 칸 */
export function HttpMetricsOverviewCell({
  data,
  days,
  granted,
}: {
  data: ReturnType<typeof useAdminHttpMetrics>['data'];
  days: number;
  granted: boolean;
}) {
  const view = useMemo(() => selectHttpMetricsView(data, days), [data, days]);
  return (
    <Cell title={`앱 서버 HTTP 오류율·429 (최근 ${days}일)`} className="xl:col-span-2">
      <HttpSummaryKpis view={view} days={days} />
      <Note size="2xs" className="my-0">
        {granted
          ? `${HTTP_SCOPE_NOTICE} 경로별·일별 상세 추이는 운영 탭에서 볼 수 있어요.`
          : `${HTTP_SCOPE_NOTICE} 운영 DB에 연결하면 채워져요.`}
      </Note>
    </Cell>
  );
}

/** 운영 탭용 HTTP 오류율·429 상세 카드 (기간·새로고침은 OpsTab이 제어한다) */
export function HttpMetricsOpsSection({
  granted,
  days = 30,
  refreshSignal = 0,
}: {
  granted: boolean;
  days?: number;
  refreshSignal?: number;
}) {
  const { data, loading, error, refresh } = useAdminHttpMetrics(days);
  const view = useMemo(() => selectHttpMetricsView(data, days), [data, days]);
  const lastSignalRef = useRef(refreshSignal);

  useEffect(() => {
    if (refreshSignal !== lastSignalRef.current) {
      lastSignalRef.current = refreshSignal;
      refresh();
    }
  }, [refreshSignal, refresh]);

  return (
    <AdminCard title={`앱 서버 HTTP 오류율·429 (최근 ${days}일)`}>
      <div className="flex flex-col gap-3">
        <Note size="2xs" className="my-0">{HTTP_SCOPE_NOTICE}</Note>

        {((loading && granted) || error) && (
          <TabState loading={loading && granted} error={error} onRetry={refresh} />
        )}

        <AdminKpiGrid cols={4}>
          <AdminKpiCard label="앱 서버 총 요청" value={fmtCount(view.summary.total)} sub={`최근 ${days}일 통과 요청`} />
          <AdminKpiCard
            label="5xx 서버 오류"
            value={view.summary.rate5xxText}
            sub={`${fmtCount(view.summary.status5xx)}건`}
            tone={(view.summary.status5xx ?? 0) > 0 ? 'danger' : 'ok'}
          />
          <AdminKpiCard
            label="429 레이트리밋"
            value={view.summary.rate429Text}
            sub={`${fmtCount(view.summary.status429)}건`}
            tone={(view.summary.status429 ?? 0) > 0 ? 'warn' : 'default'}
          />
          <AdminKpiCard label="426 구버전 거부" value={view.summary.rate426Text} sub={`${fmtCount(view.summary.status426)}건`} />
        </AdminKpiGrid>

        <AdminKpiGrid cols={4}>
          <AdminKpiCard label="p50 지연" value={view.summary.latency.p50Text} sub={`표본 ${fmtNum(view.summary.latency.samples)}건`} />
          <AdminKpiCard label="p95 지연" value={view.summary.latency.p95Text} />
          <AdminKpiCard label="p99 지연" value={view.summary.latency.p99Text} />
          <AdminKpiCard label="평균 지연" value={view.summary.latency.avgText} />
        </AdminKpiGrid>

        <Inset className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              409 충돌 <strong className="pf-accent text-gold">{fmtCount(view.summary.status409)}건</strong>{' '}
              <span className="text-text-dim">({view.summary.rate409Text})</span>
            </span>
            <span>
              4xx 전체 <strong className="pf-accent text-gold">{fmtCount(view.summary.status4xx)}건</strong>{' '}
              <span className="text-text-dim">({view.summary.rate4xxText})</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-text-dim">
            <span>429 사유:</span>
            <Badge size="xs">캐치 {fmtNum(view.summary.rateLimitReasons.catchTooSoon)}</Badge>
            <Badge size="xs">편지 {fmtNum(view.summary.rateLimitReasons.letterGap)}</Badge>
            <Badge size="xs">기타 {fmtNum(view.summary.rateLimitReasons.other)}</Badge>
          </div>
        </Inset>

        <AdminSplit variant="2">
          <BarsChart
            values={view.series.status429}
            labels={view.series.labels}
            height={68}
            highlight="peak"
            ariaLabel={`최근 ${days}일 일별 429 응답 수`}
          />
          <BarsChart
            values={view.series.status5xx}
            labels={view.series.labels}
            height={68}
            highlight="peak"
            ariaLabel={`최근 ${days}일 일별 5xx 오류 수`}
          />
        </AdminSplit>

        <Note size="2xs" className="my-0">
          {granted
            ? `최근 ${days}일 중 ${view.series.collected}일이 집계되어 있어요. 비어 있는 날은 아직 집계하지 않은 날(미집계)이에요.`
            : '운영 DB에 연결하면 채워져요.'}
        </Note>

        {view.byRoute.length > 0 && (
          <AdminTableWrap scroll>
            <DataTable className="pf-admin-table">
              <thead>
                <tr>
                  <th className="text-left">경로 묶음</th>
                  <th className="text-right">총 요청</th>
                  <th className="text-right">409</th>
                  <th className="text-right">426</th>
                  <th className="text-right">429</th>
                  <th className="text-right">5xx</th>
                  <th className="text-right">429율</th>
                  <th className="text-right">5xx율</th>
                  <th className="text-right">p95</th>
                  <th className="text-right">평균 지연</th>
                </tr>
              </thead>
              <tbody>
                {view.byRoute.map(r => (
                  <tr key={r.routeGroup}>
                    <td className="text-xs">{r.label}</td>
                    <td className="text-right pf-accent text-gold">{fmtNum(r.total)}</td>
                    <td className="text-right">{fmtNum(r.status409)}</td>
                    <td className="text-right">{fmtNum(r.status426)}</td>
                    <td className="text-right">{fmtNum(r.status429)}</td>
                    <td className="text-right">{fmtNum(r.status5xx)}</td>
                    <td className="text-right text-text-dim">{r.rate429Text}</td>
                    <td className="text-right text-text-dim">{r.rate5xxText}</td>
                    <td className="text-right text-text-dim">{r.p95Text}</td>
                    <td className="text-right text-text-dim">{r.avgText}</td>
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
