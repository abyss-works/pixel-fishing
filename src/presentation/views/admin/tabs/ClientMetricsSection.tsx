// 클라이언트 체감 성능, RTT, 프레임, 소켓 재연결 섹션 (비식별 운영 지표만 표시한다)
import { useMemo, useState } from 'react';
import DataTable from '../../../ui/DataTable';
import Inset from '../../../ui/Inset';
import KpiTile from '../../../ui/KpiTile';
import Note from '../../../ui/Note';
import PillButton from '../../../ui/PillButton';
import TableBox from '../../../ui/TableBox';
import {
  CLIENT_METRICS_SCOPE_NOTICE,
  selectClientMetricsView,
} from '../../../../features/admin/model/clientMetrics';
import { fmtNum } from '../../../../features/admin/model/metrics';
import { useAdminClientMetrics } from '../../../../features/admin/service/useAdminStats';
import { Cell, KpiRow, TabState } from '../layout';
import MetricSwitch from '../widgets/MetricSwitch';

type ClientMetricsRange = '7' | '14' | '30';

const CLIENT_RANGE_OPTIONS: { key: ClientMetricsRange; label: string }[] = [
  { key: '7', label: '7일' },
  { key: '14', label: '14일' },
  { key: '30', label: '30일' },
];

/** 운영 탭용 클라이언트 체감 성능 및 단절 칸 */
export default function ClientMetricsSection({ granted }: { granted: boolean }) {
  const [range, setRange] = useState<ClientMetricsRange>('7');
  const days = Number(range);
  const { data, loading, error, refresh } = useAdminClientMetrics(days);
  const view = useMemo(() => selectClientMetricsView(data, days), [data, days]);

  return (
    <Cell title="클라이언트 체감 성능 및 단절" className="xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Note size="2xs" className="my-0">
          {CLIENT_METRICS_SCOPE_NOTICE}
        </Note>
        <div className="flex flex-wrap items-center gap-2">
          <MetricSwitch
            value={range}
            options={CLIENT_RANGE_OPTIONS}
            onChange={setRange}
            ariaLabel="클라이언트 성능 기간 선택"
          />
          <PillButton type="button" onClick={refresh} disabled={!granted || loading}>
            새로고침
          </PillButton>
        </div>
      </div>

      {((loading && granted) || error) && (
        <TabState loading={loading && granted} error={error} onRetry={refresh} />
      )}

      <KpiRow>
        <KpiTile
          label="LCP p95"
          value={view.lcp.p95Text}
          hint={`p50 ${view.lcp.p50Text} / 평균 ${view.lcp.avgText} (표본 ${fmtNum(view.lcp.samples)}건)`}
        />
        <KpiTile
          label="INP p95"
          value={view.inp.p95Text}
          hint={`p50 ${view.inp.p50Text} / 평균 ${view.inp.avgText} (표본 ${fmtNum(view.inp.samples)}건)`}
        />
        <KpiTile
          label="CLS 평균"
          value={view.clsText}
          hint="누적 레이아웃 이동"
        />
        <KpiTile
          label="TTFB p95"
          value={view.ttfb.p95Text}
          hint={`p50 ${view.ttfb.p50Text} / 평균 ${view.ttfb.avgText} (표본 ${fmtNum(view.ttfb.samples)}건)`}
        />
      </KpiRow>

      <KpiRow>
        <KpiTile
          label="액션 RTT p95"
          value={view.actionRtt.p95Text}
          hint={`p50 ${view.actionRtt.p50Text} / 평균 ${view.actionRtt.avgText}`}
        />
        <KpiTile
          label="조회 RTT p95"
          value={view.meRtt.p95Text}
          hint={`p50 ${view.meRtt.p50Text} / 평균 ${view.meRtt.avgText}`}
        />
        <KpiTile
          label="긴 프레임 비율"
          value={view.canvas.longFramePctText}
          hint={`긴 프레임 ${fmtNum(view.canvas.longFrames)} / ${fmtNum(view.canvas.frames)}`}
        />
        <KpiTile
          label="WS 재연결 / 비정상"
          value={`${fmtNum(view.ws.reconnects)} / ${fmtNum(view.ws.abnormalCloses)}`}
          hint="재연결 / 비정상 종료"
        />
      </KpiRow>

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
        <TableBox className="max-h-[240px]">
          <DataTable aria-label="일별 클라이언트 체감 성능">
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
        </TableBox>
      )}
    </Cell>
  );
}
