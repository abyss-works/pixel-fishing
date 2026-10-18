// 활동 구역 — 접속·활동의 시간축(DAU/WAU)과 리텐션 코호트. boot 이벤트 기록은 2026-08 이후 시작됐다.
// 따라서 그 이전 기간의 수치는 '행동한 유저' 수다.
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { fmtNum, lastNDays, fillSeries } from '../../../../features/admin/model/metrics';
import { readAdminMetrics } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { StackedBarsPair, RetentionCell } from '../charts';
import { Cell, CellGrid, TabState } from '../layout';
import type { DayRange } from './dayRange';

const COHORTS = ['d1', 'd3', 'd7', 'd14', 'd30'] as const;
const RETENTION_COLS: { key: typeof COHORTS[number]; label: string }[] = [
  { key: 'd1', label: 'D+1' }, { key: 'd3', label: 'D+3' }, { key: 'd7', label: 'D+7' },
  { key: 'd14', label: 'D+14' }, { key: 'd30', label: 'D+30' },
];

// 조회 전 골격 — 게이트는 내용을 교체하지 않으므로 빈 값으로도 축과 표를 그린다
const EMPTY: Awaited<ReturnType<typeof readAdminMetrics>> = [[], []];

export default function MetricsTab({ range }: { range: DayRange }) {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  // 범위는 캐시 키에 들어간다 — 전환하면 그 범위를 새로 조회한다
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.metrics(Number(range)), () => readAdminMetrics(Number(range)), granted);

  // 조회 결과는 최신순(desc)으로 온다 — 차트는 과거→오름차순 축이 읽기 쉽다
  const [dailyDesc, retention] = data ?? EMPTY;
  const daily = [...dailyDesc].reverse();

  const days = lastNDays(Number(range));
  // 둘 다 과거→오름차순(BarsChart는 왼쪽이 과거, 맨 오른쪽이 금일) — fillSeries가 이미
  // days 축과 같은 순서로 채우므로 여기서 뒤집지 않는다(이중 반전은 축을 깬다)
  const dau = fillSeries(daily, days, r => r.day, r => r.dau);
  const wau = fillSeries(daily, days, r => r.day, r => r.wau7);
  // 막대 이름은 월-일만 — 눈금은 차트가 일정 간격으로 골라 보인다
  const labels = days.map(d => d.slice(5));

  return (
    <>
      <TabState loading={loading && granted} error={error} onRetry={refresh} />

      <CellGrid>
        <Cell title="활성 유저">
          {daily.length > 0 ? (
            <>
              <StackedBarsPair a={dau} b={wau} labels={labels}
                               ariaLabel={`일별 활성 유저, 최근 ${range}일의 DAU와 WAU, 금일 DAU ${fmtNum(dau[dau.length - 1] ?? NaN)}`} />
              <Note size="2xs" className="my-0">
                접속(boot) 기록이 생기기 전 구간은 행동이 있어야 DAU로 잡혀요. 그래서 낮게 읽히는 쪽이 맞아요.
                WAU는 직전 7일을 합산한 고유 유저예요.
              </Note>
            </>
          ) : (
            <Note size="2xs" className="my-0">
              {granted ? '아직 활성 데이터가 없어요.' : '운영 DB에 연결하면 채워져요.'}
            </Note>
          )}
        </Cell>

        <Cell title="리텐션 코호트" flush>
          {retention.length > 0 ? (
            <div className="overflow-x-auto px-1">
              <DataTable>
                <thead>
                  <tr>
                    <th className="text-left">코호트</th><th className="text-right">유저</th>
                    {RETENTION_COLS.map(c => <th key={c.key} className="text-center">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {retention.slice(0, 14).map(r => (
                    <tr key={r.cohort}>
                      <td className="whitespace-nowrap text-xs">{r.cohort}</td>
                      <td className="text-right text-xs text-text-dim">{fmtNum(r.users)}</td>
                      {RETENTION_COLS.map(c => (
                        <RetentionCell key={c.key} pct={r[c.key]}
                                       hint={`${r.cohort} 코호트 ${c.label}`} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          ) : (
            <Note size="2xs" className="my-0 px-3 py-2">
              {granted ? '아직 코호트가 없어요.' : '운영 DB에 연결하면 채워져요.'}
            </Note>
          )}
        </Cell>
      </CellGrid>
    </>
  );
}
