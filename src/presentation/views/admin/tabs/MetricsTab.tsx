// 지표 탭 — 접속·활동의 시간축(DAU/WAU)과 리텐션 코호트. boot 이벤트 기록은 2026-08 이후 시작됐다.
// 따라서 그 이전 기간의 수치는 '행동한 유저' 수다.
import { useState } from 'react';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import MetricSwitch from '../widgets/MetricSwitch';
import { fmtNum, lastNDays, fillSeries } from '../../../../features/admin/model/metrics';
import { readAdminMetrics } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { ChartSection, StackedBarsPair, RetentionCell, TabState } from '../charts';

type Range = '30' | '90';
const COHORTS = ['d1', 'd3', 'd7', 'd14', 'd30'] as const;
const RETENTION_COLS: { key: typeof COHORTS[number]; label: string }[] = [
  { key: 'd1', label: 'D+1' }, { key: 'd3', label: 'D+3' }, { key: 'd7', label: 'D+7' },
  { key: 'd14', label: 'D+14' }, { key: 'd30', label: 'D+30' },
];

// 조회 전 골격 — 게이트는 내용을 교체하지 않으므로 빈 값으로도 축과 표를 그린다
const EMPTY: Awaited<ReturnType<typeof readAdminMetrics>> = [[], []];

export default function MetricsTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const [range, setRange] = useState<Range>('30');
  // 범위는 캐시 키에 들어간다 — 전환하면 그 범위를 새로 조회한다
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.metrics(Number(range)), () => readAdminMetrics(Number(range)), granted);

  // 뷰는 최신순(desc)으로 온다 — 차트는 과거→오름차순 축이 읽기 쉽다
  const [dailyDesc, retention] = data ?? EMPTY;
  const daily = [...dailyDesc].reverse();

  const days = lastNDays(Number(range));
  // 둘 다 과거→오름차순(BarsChart는 왼쪽이 과거, 맨 오른쪽이 금일) — fillSeries가 이미
  // days 축과 같은 순서로 채우므로 여기서 뒤집지 않는다(이중 반전은 축을 깬다)
  const dau = fillSeries(daily, days, r => r.day, r => r.dau);
  const wau = fillSeries(daily, days, r => r.day, r => r.wau7);
  // 눈금 라벨은 ~6칸마다만 — 친구 규모 화면 폭을 위해
  const labels = days.map((d, i) =>
    i % Math.ceil(days.length / 6) === 0 ? d.slice(5) : null);

  return (
    <div className="flex flex-col gap-3">
      <ChartSection title="활성 유저" aside={
        <>
          <MetricSwitch value={range}
                        options={[{ key: '30', label: '30일' }, { key: '90', label: '90일' }]}
                        onChange={setRange} ariaLabel="기간 선택" />
          <span className="text-2xs text-text-dim self-center">
            DAU 금일 {fmtNum(dau[dau.length - 1] ?? NaN)}
          </span>
        </>
      }>
        <TabState loading={loading && granted} error={error} onRetry={refresh} />

        {daily.length > 0 ? (
          <>
            <StackedBarsPair a={dau} b={wau} labels={labels} />
            <Note size="2xs" className="my-0">
              접속(boot) 도입 전 구간은 액션이 있어야 DAU로 섞인다 — 낮게 읽히는 쪽이 맞다.
              WAU는 직전 7일 합산 고유 유저.
            </Note>
          </>
        ) : (
          <Note size="2xs" className="my-0">
            {granted ? '아직 활성 데이터가 없다.' : '운영 DB 연결 후 채워진다.'}
          </Note>
        )}
      </ChartSection>

      <ChartSection title="리텐션 코호트">
        {retention.length > 0 ? (
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
        ) : (
          <Note size="2xs" className="my-1">
            {granted ? '아직 코호트가 없다.' : '운영 DB 연결 후 채워진다.'}
          </Note>
        )}
      </ChartSection>
    </div>
  );
}
