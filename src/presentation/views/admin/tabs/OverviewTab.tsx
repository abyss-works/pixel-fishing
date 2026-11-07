// 개요 탭 — "지금 살아 있는가 · 추세가 어떤가 · 이상한 일이 진행 중인가"를 한 화면으로.
// 레이아웃: 지표 줄 두 개(접속·활성 / 신규·세션·리텐션) → 기간(7·30·90일) 일별 집계 차트 여섯 칸
// → 최근 이벤트 피드(넓게)와 위험 신호(오른쪽 고정 칸).
// 오늘 값은 아직 일별 집계에 없으므로 명부·실시간 접속·세션 기록에서 센다. 차트는 일별 집계만 쓴다.
import { useState } from 'react';
import DataTable from '../../../ui/DataTable';
import KpiTile from '../../../ui/KpiTile';
import Note from '../../../ui/Note';
import { cx } from '../../../ui/cx';
import { fmtNum, fmtDT, lastNDays, EVENT_LABELS, eventSummary, RISKY_EVENT_TYPES } from '../../../../features/admin/model/metrics';
import { adminIdentityLookup, selectRiskSignals } from '../../../../features/admin/model/adminViews';
import {
  fmtDuration, latestRetention, selectActiveUsers, selectDailySeries, selectNewToday, selectTodaySessions,
} from '../../../../features/admin/model/dashboard';
import type { RetentionPoint } from '../../../../features/admin/model/dashboard';
import { readAdminOverview } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import {
  useAdminDailyStats, useAdminLive, useAdminRetention, useAdminSessions,
} from '../../../../features/admin/service/useAdminStats';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { BarsChart } from '../charts';
import { Cell, CellGrid, KpiRow, TabPage, TabState } from '../layout';
import UserIdentity from '../UserIdentity';
import MetricSwitch from '../widgets/MetricSwitch';
import { OVERVIEW_RANGE_OPTIONS } from './dayRange';
import type { DayRange } from './dayRange';

// 오늘 평균 세션 길이를 셀 세션 기록 건수
// ponytail: 최근 500건만 본다. 하루 세션이 500건을 넘으면 오늘 평균은 늦은 세션만으로 계산된다 — 그때는 서버가 오늘 값을 내게 한다
const SESSION_WINDOW = 500;

// 조회 전 골격 — 게이트는 내용을 교체하지 않으므로 빈 값으로도 지표 '—'와 빈 표를 그린다
const EMPTY: Awaited<ReturnType<typeof readAdminOverview>> = [[], [], []];

export default function OverviewTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const [range, setRange] = useState<DayRange>('30');
  const days = Number(range);

  const overview = useAdminQuery(adminKeys.overview, readAdminOverview, granted);
  const live = useAdminLive();
  const stats = useAdminDailyStats(days);
  const retention = useAdminRetention();
  const sessions = useAdminSessions(null, SESSION_WINDOW);
  const queries = [overview, live, stats, retention, sessions];

  const [users, recent, flags] = overview.data ?? EMPTY;
  const risk = selectRiskSignals(users, flags);
  const identityOf = adminIdentityLookup(users);
  // 오늘·7일·30일 경계는 조회가 도착한 시각 기준이다 — 다시 읽으면 함께 다시 센다
  const active = overview.data && selectActiveUsers(users, overview.updatedAt);
  const fresh = overview.data && selectNewToday(users, overview.updatedAt);
  const today = sessions.data && selectTodaySessions(sessions.data, sessions.updatedAt);
  const d1 = retention.data && latestRetention(retention.data, 'd1');
  const d7 = retention.data && latestRetention(retention.data, 'd7');
  const series = selectDailySeries(stats.data ?? [], lastNDays(days));

  const count = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtNum(v));
  const charts: { title: string; values: number[]; aria: string; text?: (v: number) => string }[] = [
    { title: 'DAU', values: series.dau, aria: `최근 ${days}일 일별 활성 사람 수` },
    { title: '세션 수', values: series.sessions, aria: `최근 ${days}일 일별 접속 세션 수` },
    { title: '평균 세션 길이', values: series.avgSessionMin, aria: `최근 ${days}일 일별 평균 세션 길이(분)`,
      text: v => fmtDuration(v * 60) },
    { title: '캐치 수', values: series.catches, aria: `최근 ${days}일 일별 캐치 수` },
    { title: '골드 유입', values: series.goldIn, aria: `최근 ${days}일 일별 골드 유입` },
    { title: '골드 유출', values: series.goldOut, aria: `최근 ${days}일 일별 골드 유출` },
  ];

  return (
    <TabPage title="개요" context="지금 접속과 활성 사람, 기간별 추세, 위험 신호를 한눈에 봐요."
             aside={<MetricSwitch value={range} options={OVERVIEW_RANGE_OPTIONS} onChange={setRange}
                                  ariaLabel="기간 선택" />}>
      <KpiRow>
        <KpiTile label="지금 접속" value={count(live.data?.count)} hint="실시간 채널에 연결된 사람" />
        <KpiTile label="오늘 DAU" value={count(active?.today)} hint="오늘(KST) 활동한 사람" />
        <KpiTile label="WAU" value={count(active?.week)} hint="최근 7일 안에 활동한 사람" />
        <KpiTile label="MAU" value={count(active?.month)}
                 hint={`최근 30일 안에 활동한 사람 · 등록 ${overview.data ? fmtNum(users.length) : '—'}명`} />
      </KpiRow>
      <KpiRow>
        <KpiTile label="오늘 신규" value={count(fresh?.users)} hint={`그중 가입 계정 ${count(fresh?.accounts)}`} />
        <KpiTile label="오늘 평균 세션" value={today ? fmtDuration(today.avgSec) : '—'}
                 hint={`오늘 시작해 끝난 세션 ${count(today?.count)}개`} />
        <RetentionTile label="D1 리텐션" point={d1} loaded={retention.data !== null} />
        <RetentionTile label="D7 리텐션" point={d7} loaded={retention.data !== null} />
      </KpiRow>

      <TabState loading={granted && queries.some(q => q.loading)} />
      {queries.map((q, i) => <TabState key={i} error={q.error} onRetry={q.refresh} />)}

      <CellGrid>
        {charts.map(c => (
          <Cell key={c.title} title={c.title}>
            <BarsChart values={c.values} labels={series.labels} height={72} highlight="peak"
                       valueText={c.text} ariaLabel={c.aria} />
          </Cell>
        ))}
      </CellGrid>
      <Note size="2xs" className="my-0">
        {granted
          ? `최근 ${days}일 중 ${series.collected}일이 집계되어 있어요. 비어 있는 날은 아직 집계하지 않은 날(미집계)이에요.`
          : '운영 DB에 연결하면 채워져요.'}
      </Note>

      {/* 왼쪽 피드(1fr) / 오른쪽 위험 신호(고정폭) — xl 미만에서는 세로로 쌓는다 */}
      <CellGrid side>
        <Cell title="최근 이벤트 피드" flush>
          <div className="pf-scroll-panel max-h-[420px] pf-vscroll px-1">
            <DataTable>
              <thead>
                <tr><th className="text-left">시각</th><th className="text-left">유형</th>
                    <th className="text-left">유저</th><th className="text-left">내용</th></tr>
              </thead>
              <tbody>
                {recent.map(e => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap text-text-dim">{fmtDT(e.created_at)}</td>
                    <td className="whitespace-nowrap">
                      <span className={cx('pf-accent', RISKY_EVENT_TYPES.has(e.type) ? 'text-danger' : 'text-gold')}>
                        {EVENT_LABELS[e.type] ?? e.type}
                      </span>
                    </td>
                    <td className="max-w-[200px]"><UserIdentity user={identityOf(e.user_id)} /></td>
                    <td className="max-w-[260px] truncate text-xs">{eventSummary(e.type, e.payload)}</td>
                  </tr>
                ))}
                {recent.length === 0 &&
                  <tr><td colSpan={4} className="text-text-dim text-center py-3">
                    {granted ? '아직 이벤트가 없어요.' : '운영 DB에 연결하면 채워져요.'}
                  </td></tr>}
              </tbody>
            </DataTable>
          </div>
        </Cell>

        <Cell title="위험 신호" flush divided>
          <RiskRow label="제재 계정" count={risk.restrictedCount}
                   hint="제재 플래그가 켜져서 활동이 막힌 계정이에요."
                   tone="danger" />
          <RiskRow label="연타 플래그 유저" count={risk.spamUsers}
                   hint="최근 7일 동안 낚시 간격이 2초보다 짧았던 유저예요. 사람이 낼 수 없는 간격이에요."
                   tone="warn" />
          {risk.riskTotal > 0 && (
            <Note size="2xs" className="my-0 px-3 py-2">
              자세한 내용은 플레이어 탭의 <span className="pf-accent text-gold">이상탐지</span>에서 볼 수 있어요.
            </Note>
          )}
        </Cell>
      </CellGrid>
    </TabPage>
  );
}

// 리텐션 지표 타일 — 값이 정해진 가장 최근 가입일 코호트의 비율과 그 코호트
function RetentionTile({ label, point, loaded }: { label: string; point: RetentionPoint | null; loaded: boolean }) {
  return (
    <KpiTile label={label} value={point ? `${point.pct}%` : '—'}
             hint={point ? `${point.day} 가입 ${fmtNum(point.size)}명 기준`
               : loaded ? '아직 값이 정해진 코호트가 없어요' : '가입일 코호트 기준'} />
  );
}

// 위험 신호 한 줄 — 건수 하나와 그 근거 한 줄. 누르는 동작은 없다(자세한 내용은 플레이어 탭에서 본다)
function RiskRow({ label, count, hint, tone }: {
  label: string; count: number; hint: string;
  tone: 'warn' | 'danger';
}) {
  const active = count > 0;
  return (
    <div className="px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">{label}</span>
        <span className={cx('text-lg pf-accent',
                            !active ? 'text-text-dim'
                            : tone === 'danger' ? 'text-danger' : 'text-gold')}>
          {fmtNum(count)}
        </span>
      </div>
      <Note size="2xs" className="my-0">{hint}</Note>
    </div>
  );
}
