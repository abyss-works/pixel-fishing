// 활동 구역 — 요약 보기에서는 핵심 4 KPI(1일차/7일차 잔존, 최근 DAU, 활성·신규 추이)만, 상세 보기에서는 추이 차트 4개와 코호트 표를 보여준다.
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { fmtNum, lastNDays } from '../../../../features/admin/model/metrics';
import { latestRetention, selectDailySeries, selectRetentionTable } from '../../../../features/admin/model/dashboard';
import { useAdminDailyStats, useAdminRetention } from '../../../../features/admin/service/useAdminStats';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { BarsChart, RetentionCell } from '../charts';
import { AdminCard, AdminKpiCard, AdminKpiGrid, AdminSplit, AdminTableWrap, TabState } from '../layout';
import { useAdminViewMode } from '../viewMode';
import type { AdminViewMode } from '../viewMode';
import type { DayRange } from './dayRange';

const RETENTION_COLS = [
  { key: 'd1', label: 'D+1' }, { key: 'd7', label: 'D+7' }, { key: 'd30', label: 'D+30' },
] as const;

// 코호트 표에 보이는 가입일 수
const COHORT_ROWS = 30;

export default function MetricsTab({ range, mode }: { range: DayRange; mode?: AdminViewMode }) {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const { viewMode: ctxMode } = useAdminViewMode();
  const effectiveMode = mode ?? ctxMode;

  const days = Number(range);
  const stats = useAdminDailyStats(days);
  const retention = useAdminRetention();

  const statsRows = stats.data ?? [];
  const retentionRows = retention.data ?? [];
  const series = selectDailySeries(statsRows, lastNDays(days));
  const cohorts = selectRetentionTable(retentionRows, COHORT_ROWS);

  const d1 = retention.data ? latestRetention(retentionRows, 'd1') : null;
  const d7 = retention.data ? latestRetention(retentionRows, 'd7') : null;
  const latestStat = statsRows.length > 0 ? statsRows[statsRows.length - 1] : null;

  const charts = [
    { title: '활성 사람(DAU)', values: series.dau, aria: `최근 ${days}일 일별 활성 사람 수` },
    { title: '세션 수', values: series.sessions, aria: `최근 ${days}일 일별 접속 세션 수` },
    { title: '신규 사용자', values: series.newUsers, aria: `최근 ${days}일 일별 신규 사용자 수(게스트 포함)` },
    { title: '신규 가입 계정', values: series.newAccounts, aria: `최근 ${days}일 일별 신규 가입 계정 수` },
  ];

  return (
    <>
      <TabState loading={(stats.loading || retention.loading) && granted} />
      <TabState error={stats.error} onRetry={stats.refresh} />
      <TabState error={retention.error} onRetry={retention.refresh} />

      <AdminKpiGrid cols={4}>
        <AdminKpiCard
          label="1일차 잔존"
          value={d1 ? `${d1.pct}%` : '--'}
          sub={d1 ? `${d1.day} 코호트` : '최신 코호트 기준'}
          tone={d1 ? 'ok' : 'dim'}
        />
        <AdminKpiCard
          label="7일차 잔존"
          value={d7 ? `${d7.pct}%` : '--'}
          sub={d7 ? `${d7.day} 코호트` : '최신 코호트 기준'}
          tone={d7 ? 'accent' : 'dim'}
        />
        <AdminKpiCard
          label="최근 DAU"
          value={latestStat ? fmtNum(latestStat.dau) : '--'}
          sub={latestStat ? `${latestStat.day} 기준` : `최근 ${days}일`}
          tone="gold"
        />
        <AdminKpiCard
          label="활성·신규 추이"
          value={latestStat ? `+${fmtNum(latestStat.newUsers)}명` : '--'}
          sub={latestStat
            ? `세션 ${fmtNum(latestStat.sessions)}회 / 집계 ${series.collected}일`
            : '일별 집계 대기'}
          tone="default"
        />
      </AdminKpiGrid>

      {effectiveMode === 'detail' && (
        <>
          <AdminSplit variant="2">
            {charts.map(c => (
              <AdminCard key={c.title} title={c.title}>
                <BarsChart
                  values={c.values}
                  labels={series.labels}
                  height={72}
                  highlight="peak"
                  ariaLabel={c.aria}
                />
              </AdminCard>
            ))}
          </AdminSplit>
          <Note size="2xs" className="my-0">
            {granted
              ? `최근 ${days}일 중 ${series.collected}일이 집계되어 있어요. 비어 있는 날은 아직 집계하지 않은 날(미집계)이에요. 신규 사용자는 게스트를 포함해요.`
              : '운영 DB에 연결하면 채워져요.'}
          </Note>

          <AdminCard title="리텐션 코호트">
            {cohorts.length > 0 ? (
              <>
                <AdminTableWrap scroll>
                  <DataTable className="pf-admin-table">
                    <thead>
                      <tr>
                        <th className="text-left">가입일</th>
                        <th className="text-right">인원</th>
                        {RETENTION_COLS.map(c => <th key={c.key} className="text-center">{c.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {cohorts.map(r => (
                        <tr key={r.day}>
                          <td className="whitespace-nowrap text-xs">{r.day}</td>
                          <td className="text-right text-xs text-text-dim">{fmtNum(r.size)}</td>
                          {RETENTION_COLS.map(c => (
                            <RetentionCell key={c.key} pct={r[c.key]} hint={`${r.day} 가입 ${c.label}`} />
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </AdminTableWrap>
                <Note size="2xs" className="my-0 pt-2">
                  가입일 코호트에서 D+N일에 활동한 사람의 비율(%)이에요. 빈 칸은 아직 그날이 오지 않은 코호트예요.
                </Note>
              </>
            ) : (
              <Note size="2xs" className="my-0">
                {granted ? '아직 코호트가 없어요.' : '운영 DB에 연결하면 채워져요.'}
              </Note>
            )}
          </AdminCard>
        </>
      )}
    </>
  );
}
