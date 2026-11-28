// 현황 탭 — "지금 살아 있는가 · 즉시 처리할 신고/경보가 있는가 · 추세가 어떤가"를 요약/상세 전환으로 본다.
import { Suspense, lazy, useState } from 'react';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { cx } from '../../../ui/cx';
import { fmtNum, fmtDT, lastNDays, EVENT_LABELS, eventSummary, RISKY_EVENT_TYPES } from '../../../../features/admin/model/metrics';
import { adminIdentityLookup, selectRiskSignals } from '../../../../features/admin/model/adminViews';
import {
  fmtDuration, latestRetention, selectActiveUsers, selectDailySeries,
  selectTotalUsersCount,
} from '../../../../features/admin/model/dashboard';
import type { AdminChatReportRow, AdminUserRow } from '../../../../features/admin/model/types';
import { readAdminChatReports } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminDailyStats, useAdminHttpMetrics, useAdminOverview } from '../../../../features/admin/service/useAdminStats';
import { useAdminUserActions } from '../../../../features/admin/service/useAdminUserActions';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { formatAdminLocation } from '../../../../features/admin/model/regions';
import { BarsChart } from '../charts';
import {
  AdminCard, AdminKpiCard, AdminKpiGrid, AdminQueueItem, AdminSplit, AdminSubnavExtra, AdminTableWrap, TabState,
} from '../layout';
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
  const statsRows = days === DEFAULT_RANGE_DAYS ? (overview.data?.dailyStats ?? []) : (extraStats.data ?? []);
  const reports = reportsQuery.data ?? NO_REPORTS;

  const risk = selectRiskSignals(users, flags);
  const identityOf = adminIdentityLookup(users);
  const userByUid = new Map(users.map(u => [u.user_id.toLowerCase(), u]));
  const active = overview.data && selectActiveUsers(users, overview.updatedAt, aggregates);
  const totalUsers = selectTotalUsersCount(users, aggregates);
  const d1 = retentionRows && latestRetention(retentionRows, 'd1');
  const d7 = retentionRows && latestRetention(retentionRows, 'd7');
  const series = selectDailySeries(statsRows, lastNDays(days));

  const count = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtNum(v));
  const httpAlertCount = httpMetrics.data
    ? httpMetrics.data.summary.status5xx + httpMetrics.data.summary.status429
    : null;
  const alertTotal = httpAlertCount !== null
    ? httpAlertCount + risk.riskTotal
    : (overview.data ? risk.riskTotal : null);

  const charts: { title: string; values: number[]; aria: string; text?: (v: number) => string }[] = [
    { title: 'DAU', values: series.dau, aria: `최근 ${days}일 일별 활성 사람 수` },
    { title: '골드 유입', values: series.goldIn, aria: `최근 ${days}일 일별 골드 유입` },
    { title: '세션 수', values: series.sessions, aria: `최근 ${days}일 일별 접속 세션 수` },
    { title: '평균 세션 길이', values: series.avgSessionMin, aria: `최근 ${days}일 일별 평균 세션 길이(분)`,
      text: v => fmtDuration(v * 60) },
    { title: '캐치 수', values: series.catches, aria: `최근 ${days}일 일별 캐치 수` },
    { title: '골드 유출', values: series.goldOut, aria: `최근 ${days}일 일별 골드 유출` },
  ];

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

  if (!isSummarySection) {
    return <LiveTab embedded onCompose={onCompose} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <AdminSubnavExtra>
        <MetricSwitch value={range} options={OVERVIEW_RANGE_OPTIONS} onChange={setRange} ariaLabel="기간 선택" />
      </AdminSubnavExtra>

      <AdminKpiGrid cols={viewMode === 'detail' ? 8 : 4}>
        <AdminKpiCard
          label="지금 접속"
          value={count(liveData?.count)}
          sub="실시간 채널 연결"
          tone="accent"
        />
        <AdminKpiCard
          label="오늘 DAU"
          value={count(active?.today)}
          sub="오늘(KST) 활동"
          tone="gold"
        />
        <AdminKpiCard
          label="서버·이상 경보"
          value={count(alertTotal)}
          sub={`HTTP ${count(httpAlertCount)} · 제재/연타 ${overview.data ? fmtNum(risk.riskTotal) : '—'}`}
          tone={alertTotal !== null && alertTotal > 0 ? 'warn' : 'dim'}
        />
        <AdminKpiCard
          label="미처리 신고"
          value={granted ? fmtNum(reports.length) : '—'}
          sub="채팅 신고 대기"
          tone={reports.length > 0 ? 'danger' : 'dim'}
        />

        {viewMode === 'detail' && (
          <>
            <AdminKpiCard label="WAU" value={count(active?.week)} sub="최근 7일 활동" />
            <AdminKpiCard
              label="MAU"
              value={count(active?.month)}
              sub={overview.data ? `최근 30일, 등록 ${fmtNum(totalUsers)}명` : '최근 30일 활동'}
            />
            <AdminKpiCard
              label="D1 리텐션"
              value={d1 ? `${d1.pct}%` : '—'}
              sub={d1 ? `${d1.day} 가입 ${fmtNum(d1.size)}명` : retentionRows ? '코호트 대기' : '가입일 코호트'}
            />
            <AdminKpiCard
              label="D7 리텐션"
              value={d7 ? `${d7.pct}%` : '—'}
              sub={d7 ? `${d7.day} 가입 ${fmtNum(d7.size)}명` : retentionRows ? '코호트 대기' : '가입일 코호트'}
            />
          </>
        )}
      </AdminKpiGrid>

      <TabState loading={granted && queries.some(q => q.loading)} />
      {queries.map((q, i) => <TabState key={i} error={q.error} onRetry={q.refresh} />)}
      {actionError && <Note tone="warn" className="my-0">{actionError}</Note>}

      {/* 2열 배치: 좌 = 즉시 처리 큐, 우 = 핵심 추이(차트 2개) */}
      <AdminSplit variant="2">
        <AdminCard
          title="즉시 처리 큐"
          badge={<Badge tone={reports.length > 0 ? 'danger' : 'dim'} size="xs">{reports.length}건 대기</Badge>}
        >
          <div className="pf-admin-queue-list">
            {reports.length === 0 ? (
              <AdminQueueItem>
                <span className="text-xs text-text-dim">
                  {granted ? '대기 중인 채팅 신고가 없어요.' : '운영 DB에 연결하면 채워져요.'}
                </span>
                <Button size="xs" variant="ghost" onClick={() => onSection('live')}>
                  실시간 & 신고
                </Button>
              </AdminQueueItem>
            ) : (
              reports.slice(0, 5).map(r => {
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
                  <AdminQueueItem key={r.id} tone={restricted ? 'warn' : 'urgent'}>
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
                        size="xs"
                        variant={restricted ? 'ghost' : 'danger'}
                        disabled={!granted || busy || !canRestrict}
                        onClick={() => target && void toggleRestrict(target)}
                      >
                        {restricted ? '제재 해제' : '제재'}
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => setSelectedUid(r.target_id)}>
                        상세
                      </Button>
                    </div>
                  </AdminQueueItem>
                );
              })
            )}

            <AdminQueueItem tone={alertTotal !== null && alertTotal > 0 ? 'warn' : 'default'}>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-text">서버·무결성 경보</div>
                <div className="text-2xs text-text-dim mt-0.5">
                  제재 {fmtNum(risk.restrictedCount)}명 · 연타 {fmtNum(risk.spamUsers)}명 · HTTP 경보 {count(httpAlertCount)}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="xs" variant="ghost" onClick={() => onNavigate({ tab: 'players', section: 'sanctions' })}>
                  확인
                </Button>
                <Button size="xs" variant="ghost" onClick={() => onNavigate({ tab: 'ops', section: 'server' })}>
                  서버 확인
                </Button>
              </div>
            </AdminQueueItem>
          </div>
        </AdminCard>

        <AdminCard
          title="핵심 추이"
          badge={<Badge size="xs">{viewMode === 'detail' ? '대표 2개' : '요약 2개'}</Badge>}
        >
          {charts.slice(0, 2).map(c => (
            <div key={c.title} className="flex flex-col gap-1">
              <div className="text-xs text-text-dim font-bold">{c.title}</div>
              <BarsChart values={c.values} labels={series.labels} height={72} highlight="peak"
                         valueText={c.text} ariaLabel={c.aria} />
            </div>
          ))}
          <Note size="2xs" className="my-0">
            {granted
              ? `최근 ${days}일 중 ${series.collected}일이 집계되어 있어요.`
              : '운영 DB에 연결하면 채워져요.'}
          </Note>
        </AdminCard>
      </AdminSplit>

      {viewMode === 'detail' && (
        <>
          <AdminCard title="상세 확장 차트" badge={<Badge size="xs">추가 4종</Badge>}>
            <AdminSplit variant="2">
              {charts.slice(2).map(c => (
                <div key={c.title} className="flex flex-col gap-1">
                  <div className="text-xs text-text-dim font-bold">{c.title}</div>
                  <BarsChart values={c.values} labels={series.labels} height={72} highlight="peak"
                             valueText={c.text} ariaLabel={c.aria} />
                </div>
              ))}
            </AdminSplit>
          </AdminCard>

          <AdminSplit variant="2">
            <AdminCard title="최근 이벤트 피드">
              <AdminTableWrap className="max-h-[360px] overflow-y-auto">
                <DataTable className="pf-admin-table">
                  <thead>
                    <tr>
                      <th>시각</th><th>유형</th><th>유저</th><th>내용</th>
                    </tr>
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
                        <td className="max-w-[240px] truncate text-xs">{eventSummary(e.type, e.payload)}</td>
                      </tr>
                    ))}
                    {recent.length === 0 && (
                      <tr><td colSpan={4} className="text-text-dim text-center py-3">
                        {granted ? '아직 이벤트가 없어요.' : '운영 DB에 연결하면 채워져요.'}
                      </td></tr>
                    )}
                  </tbody>
                </DataTable>
              </AdminTableWrap>
            </AdminCard>

            <div className="flex flex-col gap-3">
              <HttpMetricsOverviewCell data={httpMetrics.data} days={days} granted={granted} />

              <AdminCard title={`실시간 접속 (${liveData?.online.length ?? 0})`}>
                <AdminTableWrap className="max-h-[260px] overflow-y-auto">
                  <DataTable className="pf-admin-table">
                    <thead>
                      <tr><th>계정</th><th>위치</th><th>접속 시각</th></tr>
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
                </AdminTableWrap>
              </AdminCard>
            </div>
          </AdminSplit>
        </>
      )}

      {detailUser && (
        <Suspense fallback={null}>
          <UserDetail key={detailUser.user_id} user={detailUser}
                      onClose={() => setSelectedUid(null)} onCompose={onCompose} />
        </Suspense>
      )}
    </div>
  );
}
