// 활동 구역 — 일별 집계의 장기 시계열(활성·세션·신규)과 가입일 코호트 리텐션(D+1·D+7·D+30).
// 일별 집계는 하루가 끝난 뒤 쌓이므로 집계되지 않은 날은 빈 막대(미집계)로 남는다.
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { fmtNum, lastNDays } from '../../../../features/admin/model/metrics';
import { selectDailySeries, selectRetentionTable } from '../../../../features/admin/model/dashboard';
import { useAdminDailyStats, useAdminRetention } from '../../../../features/admin/service/useAdminStats';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { BarsChart, RetentionCell } from '../charts';
import { Cell, CellGrid, TabState } from '../layout';
import type { DayRange } from './dayRange';

const RETENTION_COLS = [
  { key: 'd1', label: 'D+1' }, { key: 'd7', label: 'D+7' }, { key: 'd30', label: 'D+30' },
] as const;

// 코호트 표에 보이는 가입일 수
const COHORT_ROWS = 30;

export default function MetricsTab({ range }: { range: DayRange }) {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const days = Number(range);
  const stats = useAdminDailyStats(days);
  const retention = useAdminRetention();

  const series = selectDailySeries(stats.data ?? [], lastNDays(days));
  const cohorts = selectRetentionTable(retention.data ?? [], COHORT_ROWS);
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

      <CellGrid>
        {charts.map(c => (
          <Cell key={c.title} title={c.title}>
            <BarsChart values={c.values} labels={series.labels} height={72} highlight="peak" ariaLabel={c.aria} />
          </Cell>
        ))}
      </CellGrid>
      <Note size="2xs" className="my-0">
        {granted
          ? `최근 ${days}일 중 ${series.collected}일이 집계되어 있어요. 비어 있는 날은 아직 집계하지 않은 날(미집계)이에요. 신규 사용자는 게스트를 포함해요.`
          : '운영 DB에 연결하면 채워져요.'}
      </Note>

      <Cell title="리텐션 코호트" flush>
        {cohorts.length > 0 ? (
          <div className="overflow-x-auto px-1">
            <DataTable>
              <thead>
                <tr>
                  <th className="text-left">가입일</th><th className="text-right">인원</th>
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
            <Note size="2xs" className="my-0 px-2 pb-2">
              가입일 코호트에서 D+N일에 활동한 사람의 비율(%)이에요. 빈 칸은 아직 그날이 오지 않은 코호트예요.
            </Note>
          </div>
        ) : (
          <Note size="2xs" className="my-0 px-3 py-2">
            {granted ? '아직 코호트가 없어요.' : '운영 DB에 연결하면 채워져요.'}
          </Note>
        )}
      </Cell>
    </>
  );
}
