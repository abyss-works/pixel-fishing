// 현황 탭 — "지금 살아 있는가 · 즉시 처리할 신고/경보가 있는가 · 추세가 어떤가"를 요약/상세 전환으로 본다.
import { Suspense, lazy, useState } from 'react';
import Button from '../../../ui/Button';
import DataTable from '../../../ui/DataTable';
import Inset from '../../../ui/Inset';
import KpiTile from '../../../ui/KpiTile';
import Note from '../../../ui/Note';
import SubTabs from '../../../ui/SubTabs';
import { cx } from '../../../ui/cx';
import { fmtNum, fmtDT, lastNDays, EVENT_LABELS, eventSummary, RISKY_EVENT_TYPES } from '../../../../features/admin/model/metrics';
import { adminIdentityLookup, selectRiskSignals } from '../../../../features/admin/model/adminViews';
import {
  fmtDuration, latestRetention, selectActiveUsers, selectDailySeries, selectNewToday, selectTodaySessions,
  selectTotalUsersCount,
} from '../../../../features/admin/model/dashboard';
import type { RetentionPoint } from '../../../../features/admin/model/dashboard';
import type { AdminChatReportRow, AdminUserRow } from '../../../../features/admin/model/types';
import { readAdminChatReports } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminDailyStats, useAdminHttpMetrics, useAdminOverview } from '../../../../features/admin/service/useAdminStats';
import { useAdminUserActions } from '../../../../features/admin/service/useAdminUserActions';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { formatAdminLocation } from '../../../../features/admin/model/regions';
import { BarsChart } from '../charts';
import { Cell, CellGrid, KpiRow, TabPage, TabState } from '../layout';
import { ADMIN_SECTIONS } from '../routes';
import type { AdminRoute, OverviewSection } from '../routes';
import UserIdentity from '../UserIdentity';
import { useAdminViewMode } from '../viewMode';
import MetricSwitch from '../widgets/MetricSwitch';
import { HttpMetricsOverviewCell } from './HttpMetricsSection';
import LiveTab from './LiveTab';
import { OVERVIEW_RANGE_OPTIONS } from './dayRange';
import type { DayRange } from './dayRange';

const UserDetail = lazy(() => import('./UserDetail'));

const DEFAULT_RANGE_DAYS = 30;
const NO_REPORTS: AdminChatReportRow[] = [];

const fallbackUserRow = (userId: string): AdminUserRow => ({
  user_id: userId,
  email: null,
  nickname: null,
  is_anonymous: null,
  signed_up_at: null,
  last_sign_in_at: null,
  gold: null,
  fame: null,
  boat: null,
  rod: null,
  location_kind: null,
  location_id: null,
  visited: null,
  restricted: null,
  save_version: null,
  last_action_at: null,
  last_session_at: null,
  total_session_sec: 0,
});

export default function OverviewTab({
  section = 'summary',
  onSection = () => {},
  onNavigate = () => {},
  onCompose,
}: {
  section?: OverviewSection;
  onSection?: (section: OverviewSection) => void;
  onNavigate?: (route: AdminRoute) => void;
  onCompose?: (userId: string) => void;
} = {}) {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const { viewMode } = useAdminViewMode();
  const [range, setRange] = useState<DayRange>('30');
  const days = Number(range);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isSummarySection = section === 'summary';
  const overview = useAdminOverview(DEFAULT_RANGE_DAYS);
  const extraStats = useAdminDailyStats(days, isSummarySection && days !== DEFAULT_RANGE_DAYS);
  const httpMetrics = useAdminHttpMetrics(days);
  const reportsQuery = useAdminQuery(adminKeys.chatReports, readAdminChatReports, granted && isSummarySection);
  const actions = useAdminUserActions();

  const queries = days === DEFAULT_RANGE_DAYS ? [overview, httpMetrics] : [overview, extraStats, httpMetrics];

  const users = overview.data?.users ?? [];
  const aggregates = overview.data?.userAggregates ?? null;
  const recent = overview.data?.recentEvents ?? [];
  const flags = overview.data?.spamFlags ?? [];
  const liveData = overview.data?.live ?? null;
  const retentionRows = overview.data?.retention ?? null;
  const sessionRows = overview.data?.sessions ?? null;
  const statsRows = days === DEFAULT_RANGE_DAYS ? (overview.data?.dailyStats ?? []) : (extraStats.data ?? []);
  const reports = reportsQuery.data ?? NO_REPORTS;

  const risk = selectRiskSignals(users, flags);
  const identityOf = adminIdentityLookup(users);
  const userByUid = new Map(users.map(u => [u.user_id.toLowerCase(), u]));
  const active = overview.data && selectActiveUsers(users, overview.updatedAt, aggregates);
  const fresh = overview.data && selectNewToday(users, overview.updatedAt, aggregates);
  const totalUsers = selectTotalUsersCount(users, aggregates);
  const today = sessionRows && selectTodaySessions(sessionRows, overview.updatedAt);
  const d1 = retentionRows && latestRetention(retentionRows, 'd1');
  const d7 = retentionRows && latestRetention(retentionRows, 'd7');
  const series = selectDailySeries(statsRows, lastNDays(days));

  const count = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtNum(v));
  const httpAlertCount = httpMetrics.data
    ? httpMetrics.data.summary.status5xx + httpMetrics.data.summary.status429
    : null;

  const charts: { title: string; values: number[]; aria: string; text?: (v: number) => string }[] = [
    { title: 'DAU', values: series.dau, aria: `최근 ${days}일 일별 활성 사람 수` },
    { title: '세션 수', values: series.sessions, aria: `최근 ${days}일 일별 접속 세션 수` },
    { title: '평균 세션 길이', values: series.avgSessionMin, aria: `최근 ${days}일 일별 평균 세션 길이(분)`,
      text: v => fmtDuration(v * 60) },
    { title: '캐치 수', values: series.catches, aria: `최근 ${days}일 일별 캐치 수` },
    { title: '골드 유입', values: series.goldIn, aria: `최근 ${days}일 일별 골드 유입` },
    { title: '골드 유출', values: series.goldOut, aria: `최근 ${days}일 일별 골드 유출` },
  ];
  const visibleCharts = viewMode === 'summary' ? [charts[0], charts[4]] : charts;

  const toggleRestrict = async (target: AdminUserRow) => {
    setBusyUid(target.user_id);
    setActionError(null);
    try {
      await actions.restrict(target.user_id, target.restricted !== true);
    } catch (e) {
      setActionError(String((e as { message?: unknown }).message ?? e));
    } finally {
      setBusyUid(null);
    }
  };

  const detailUser = selectedUid
    ? (userByUid.get(selectedUid.toLowerCase()) ?? fallbackUserRow(selectedUid))
    : null;

  return (
    <TabPage
      title="현황"
      context={isSummarySection
        ? '지금 접속과 활성 사람, 즉시 처리할 신고와 경보, 기간별 추세를 한눈에 봐요.'
        : '실시간 채널에 연결된 사람과 플레이어 채팅 신고를 확인하고 바로 조치해요.'}
      aside={isSummarySection ? (
        <MetricSwitch value={range} options={OVERVIEW_RANGE_OPTIONS} onChange={setRange} ariaLabel="기간 선택" />
      ) : undefined}
    >
      <div className="max-w-[520px]">
        <SubTabs
          items={ADMIN_SECTIONS.overview.map(s => ({ key: s.key, label: s.label }))}
          activeKey={section}
          onSelect={onSection}
        />
      </div>

      {!isSummarySection ? (
        <LiveTab embedded onCompose={onCompose} />
      ) : (
        <>
          {viewMode === 'summary' ? (
            <KpiRow>
              <KpiTile label="지금 접속" value={count(liveData?.count)} hint="실시간 채널에 연결된 사람" />
              <KpiTile label="오늘 DAU" value={count(active?.today)} hint="오늘(KST) 활동한 사람" />
              <KpiTile
                label="오류·경보"
                value={count(httpAlertCount)}
                hint={`5xx + 429 (${days}일)`}
                tone={httpAlertCount !== null && httpAlertCount > 0 ? 'danger' : 'dim'}
              />
              <KpiTile
                label="미처리 신고"
                value={granted ? fmtNum(reports.length) : '—'}
                hint="채팅 신고 대기"
                tone={reports.length > 0 ? 'danger' : 'dim'}
              />
            </KpiRow>
          ) : (
            <>
              <KpiRow>
                <KpiTile label="지금 접속" value={count(liveData?.count)} hint="실시간 채널에 연결된 사람" />
                <KpiTile label="오늘 DAU" value={count(active?.today)} hint="오늘(KST) 활동한 사람" />
                <KpiTile label="WAU" value={count(active?.week)} hint="최근 7일 안에 활동한 사람" />
                <KpiTile label="MAU" value={count(active?.month)}
                         hint={overview.data ? `최근 30일 안에 활동한 사람, 등록 ${fmtNum(totalUsers)}명` : '최근 30일 안에 활동한 사람'} />
              </KpiRow>
              <KpiRow>
                <KpiTile label="오늘 신규" value={count(fresh?.users)} hint={`그중 가입 계정 ${count(fresh?.accounts)}`} />
                <KpiTile label="오늘 평균 세션" value={today ? fmtDuration(today.avgSec) : '—'}
                         hint={`오늘 시작해 끝난 세션 ${count(today?.count)}개`} />
                <RetentionTile label="D1 리텐션" point={d1} loaded={retentionRows !== null} />
                <RetentionTile label="D7 리텐션" point={d7} loaded={retentionRows !== null} />
              </KpiRow>
            </>
          )}

          <TabState loading={granted && queries.some(q => q.loading)} />
          {queries.map((q, i) => <TabState key={i} error={q.error} onRetry={q.refresh} />)}
          {actionError && <Note tone="warn" className="my-0">{actionError}</Note>}

          {viewMode === 'summary' && (
            <CellGrid side>
              <Cell title={`즉시 처리 큐 (${reports.length})`}>
                {reports.length === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Note size="xs" className="my-0">
                      {granted ? '대기 중인 채팅 신고가 없어요.' : '운영 DB에 연결하면 채워져요.'}
                    </Note>
                    <Button size="sm" variant="ghost" onClick={() => onSection('live')}>
                      실시간 & 신고 보기
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {reports.slice(0, 5).map(r => {
                      const target = userByUid.get(r.target_id.toLowerCase()) ?? null;
                      const restricted = target?.restricted === true;
                      const canRestrict = target !== null && target.restricted !== null;
                      const busy = busyUid === r.target_id;
                      const baseTarget = identityOf(r.target_id);
                      const targetIdentity = r.opHandle && !baseTarget.opHandle
                        ? { ...baseTarget, opHandle: r.opHandle }
                        : baseTarget;
                      const reportedLine = r.lines.find(l => l.id === r.message_id) ?? r.lines[0];
                      return (
                        <Inset key={r.id} tone="deep" className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <UserIdentity user={targetIdentity} inline />
                              <span className="text-2xs text-text-dim">{fmtDT(r.created_at)}</span>
                            </div>
                            {reportedLine && (
                              <span className="truncate text-xs text-danger">{reportedLine.text}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant={restricted ? 'ghost' : 'primary'}
                              disabled={!granted || busy || !canRestrict}
                              onClick={() => target && void toggleRestrict(target)}
                            >
                              {restricted ? '제재 해제' : '제재'}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setSelectedUid(r.target_id)}>
                              상세
                            </Button>
                          </div>
                        </Inset>
                      );
                    })}
                  </div>
                )}
              </Cell>

              <Cell title="이상·경보 요약" flush divided>
                <RiskRow label="제재 계정" count={risk.restrictedCount}
                         hint="제재 플래그가 켜져서 활동이 막힌 계정이에요." tone="danger" />
                <RiskRow label="연타 플래그 유저" count={risk.spamUsers}
                         hint="최근 7일 동안 낚시 간격이 2초보다 짧았던 유저예요." tone="warn" />
                <div className="flex flex-wrap gap-2 px-3 py-2">
                  <Button size="sm" variant="ghost"
                          onClick={() => onNavigate({ tab: 'players', section: 'sanctions' })}>
                    제재·무결성 보기
                  </Button>
                  <Button size="sm" variant="ghost"
                          onClick={() => onNavigate({ tab: 'ops', section: 'server' })}>
                    서버·실시간 보기
                  </Button>
                </div>
              </Cell>
            </CellGrid>
          )}

          <CellGrid>
            {visibleCharts.map(c => (
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

          {viewMode === 'detail' && (
            <CellGrid side>
              <Cell title="최근 이벤트 피드" flush>
                <div className="pf-scroll-panel max-h-[420px] overflow-y-auto px-1">
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
                    자세한 내용은 플레이어 탭의 <span className="pf-accent text-gold">제재·무결성</span>에서 볼 수 있어요.
                  </Note>
                )}
              </Cell>

              <HttpMetricsOverviewCell data={httpMetrics.data} days={days} granted={granted} />

              <Cell title={`실시간 접속 (${liveData?.online.length ?? 0})`} flush>
                <div className="pf-scroll-panel max-h-[300px] overflow-y-auto px-1">
                  <DataTable>
                    <thead>
                      <tr><th className="text-left">계정</th><th className="text-left">위치</th>
                          <th className="text-left">접속 시각</th></tr>
                    </thead>
                    <tbody>
                      {(liveData?.online ?? []).map(u => (
                        <tr key={u.uid}>
                          <td><UserIdentity user={{ user_id: u.uid, opHandle: u.opHandle, nickname: u.nickname ?? u.nick, email: u.email, is_anonymous: u.guest }} inline /></td>
                          <td className="text-xs whitespace-nowrap">{formatAdminLocation({ kind: u.region, id: u.zone })}</td>
                          <td className="text-2xs text-text-dim whitespace-nowrap">{fmtDT(u.connectedAt)}</td>
                        </tr>
                      ))}
                      {(liveData?.online.length ?? 0) === 0 && (
                        <tr><td colSpan={3} className="text-text-dim text-center py-3">
                          {granted ? '지금 연결된 사람이 없어요.' : '운영 DB에 연결하면 채워져요.'}
                        </td></tr>
                      )}
                    </tbody>
                  </DataTable>
                </div>
              </Cell>
            </CellGrid>
          )}
        </>
      )}

      {detailUser && (
        <Suspense fallback={null}>
          <UserDetail key={detailUser.user_id} user={detailUser}
                      onClose={() => setSelectedUid(null)} onCompose={onCompose} />
        </Suspense>
      )}
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

// 위험 신호 한 줄 — 건수 하나와 그 근거 한 줄
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
