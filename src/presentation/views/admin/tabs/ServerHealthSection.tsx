// 서버, WebSocket, DB 상태 및 임계 경보 섹션 — 비식별 운영 지표만 표시하며 기간·새로고침은 OpsTab이 제어한다.
import { useEffect, useMemo, useRef } from 'react';
import Badge from '../../../ui/Badge';
import DataTable from '../../../ui/DataTable';
import Inset from '../../../ui/Inset';
import Note from '../../../ui/Note';
import { fmtNum } from '../../../../features/admin/model/metrics';
import { selectOpsHealthView } from '../../../../features/admin/model/opsHealth';
import { useAdminOpsHealth } from '../../../../features/admin/service/useAdminStats';
import { AdminCard, AdminKpiCard, AdminKpiGrid, AdminTableWrap, TabState } from '../layout';

/** 운영 탭용 서버 런타임, 소켓, DB 상태 및 임계 경보 카드 */
export default function ServerHealthSection({
  granted,
  days = 7,
  refreshSignal = 0,
}: {
  granted: boolean;
  days?: number;
  refreshSignal?: number;
}) {
  const { data, loading, error, refresh } = useAdminOpsHealth(days);
  const view = useMemo(() => selectOpsHealthView(data), [data]);
  const lastSignalRef = useRef(refreshSignal);

  useEffect(() => {
    if (refreshSignal !== lastSignalRef.current) {
      lastSignalRef.current = refreshSignal;
      refresh();
    }
  }, [refreshSignal, refresh]);

  return (
    <AdminCard title="서버, 소켓, DB 상태 및 경보">
      <div className="flex flex-col gap-3">
        <Note size="2xs" className="my-0">
          {granted
            ? `최근 ${days}일 기준 런타임, WebSocket 안정성, DB 풀과 임계 경보를 보여 줘요.`
            : '운영 DB에 연결하면 서버, 소켓, DB 상태와 임계 경보가 채워져요.'}
        </Note>

        {((loading && granted) || error) && (
          <TabState loading={loading && granted} error={error} onRetry={refresh} />
        )}

        {granted && data && (
          view.alerts.length === 0 ? (
            <Inset className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-xs text-text-dim">임계 경보 상태</span>
              <Badge tone="accent" size="sm">활성 경보 없음</Badge>
            </Inset>
          ) : (
            <div className="flex flex-col gap-2">
              {view.alerts.map(alert => (
                <Inset
                  key={alert.code}
                  tone="deep"
                  border={alert.severity === 'crit' ? 'danger' : 'gold'}
                  className="flex flex-col gap-1 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={alert.severity === 'crit' ? 'danger' : 'orange'} size="xs">
                        {alert.severityLabel}
                      </Badge>
                      <span className="text-xs font-medium text-text">{alert.title}</span>
                    </div>
                    <span className="text-2xs text-text-dim">
                      관측 {alert.observed}, 기준 {alert.threshold}
                    </span>
                  </div>
                  <Note size="2xs" className="my-0">{alert.detail}</Note>
                </Inset>
              ))}
            </div>
          )
        )}

        <AdminKpiGrid cols={4}>
          <AdminKpiCard label="가동 시간" value={view.runtime.uptimeText} />
          <AdminKpiCard label="메모리" value={view.runtime.memoryText} sub="힙 사용 / RSS" />
          <AdminKpiCard label="실시간 접속" value={view.ws.onlineCountText} sub="현재 WebSocket 연결" />
          <AdminKpiCard
            label="DB 풀 (사용/최대/대기)"
            value={view.database.poolCompactText}
            sub={data ? `전체 풀 ${view.database.poolText}, 연결 ${view.database.activeConnectionsText}, ${view.database.dbSizeText}` : undefined}
          />
        </AdminKpiGrid>

        <Inset className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              업그레이드 성공 <strong className="pf-accent text-gold">{fmtNum(view.ws.upgradesOk)}건</strong>
            </span>
            <span>
              거부 401/403/500{' '}
              <strong className="pf-accent text-gold">{fmtNum(view.ws.rejectTotal)}건</strong>{' '}
              <span className="text-text-dim">
                ({view.ws.reject401}/{view.ws.reject403}/{view.ws.reject500})
              </span>
            </span>
            <span>
              정상/비정상/유휴 종료{' '}
              <strong className="pf-accent text-gold">
                {view.ws.closeNormal}/{view.ws.closeAbnormal}/{view.ws.closeIdleTimeout}
              </strong>
            </span>
          </div>
          <span className="text-text-dim">
            비정상율 <strong className="pf-accent text-gold">{view.ws.abnormalRateText}</strong>
          </span>
        </Inset>

        {view.ws.daily.length > 0 && (
          <AdminTableWrap scroll>
            <DataTable aria-label="일별 WebSocket 지표" className="pf-admin-table">
              <thead>
                <tr>
                  <th className="text-left">일자</th>
                  <th className="text-right">업그레이드 성공</th>
                  <th className="text-right">거부 401</th>
                  <th className="text-right">거부 403</th>
                  <th className="text-right">거부 500</th>
                  <th className="text-right">정상 종료</th>
                  <th className="text-right">비정상 종료</th>
                  <th className="text-right">유휴 종료</th>
                  <th className="text-right">비정상율</th>
                </tr>
              </thead>
              <tbody>
                {view.ws.daily.map(row => (
                  <tr key={row.day}>
                    <td className="text-xs">{row.dayLabel}</td>
                    <td className="text-right pf-accent text-gold">{fmtNum(row.upgradesOk)}</td>
                    <td className="text-right">{fmtNum(row.reject401)}</td>
                    <td className="text-right">{fmtNum(row.reject403)}</td>
                    <td className="text-right">{fmtNum(row.reject500)}</td>
                    <td className="text-right">{fmtNum(row.closeNormal)}</td>
                    <td className="text-right">{fmtNum(row.closeAbnormal)}</td>
                    <td className="text-right">{fmtNum(row.closeIdleTimeout)}</td>
                    <td className="text-right text-text-dim">{row.abnormalRateText}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </AdminTableWrap>
        )}

        {view.slowRequests.length === 0 ? (
          <Note size="2xs" className="my-0">최근 슬로우 요청이 없어요.</Note>
        ) : (
          <AdminTableWrap scroll>
            <DataTable aria-label="최근 슬로우 요청 목록" className="pf-admin-table">
              <thead>
                <tr>
                  <th className="text-left">시각 (KST)</th>
                  <th className="text-left">메서드</th>
                  <th className="text-left">경로 묶음</th>
                  <th className="text-left">경로</th>
                  <th className="text-right">상태</th>
                  <th className="text-right">소요 시간</th>
                </tr>
              </thead>
              <tbody>
                {view.slowRequests.map((req, idx) => (
                  <tr key={`${req.atText}-${req.path}-${idx}`}>
                    <td className="text-2xs text-text-dim whitespace-nowrap">{req.atText}</td>
                    <td className="text-xs">{req.method}</td>
                    <td className="text-xs">{req.routeLabel}</td>
                    <td className="text-xs pf-accent select-text">{req.path}</td>
                    <td className="text-right">{req.statusCode}</td>
                    <td className="text-right pf-accent text-gold">{req.durationText}</td>
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
