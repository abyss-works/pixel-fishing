// 제재·무결성 구역 — 요약 보기에서는 2열(활성 제재 현황 + 무결성 단계 현황)만, 상세 보기에서는 등급 분포 비교·전환 로그·연타/PERFECT 이상치를 함께 보여 준다.
import { Suspense, lazy, useMemo, useState } from 'react';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { cx } from '../../../ui/cx';
import { adminGradeName, fmtNum, fmtDT } from '../../../../features/admin/model/metrics';
import { adminIdentityLookup, selectAntiAbuseRows } from '../../../../features/admin/model/adminViews';
import {
  readAdminSpamFlags,
  readAdminUsers,
} from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminIntegrity } from '../../../../features/admin/service/useAdminIntegrity';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminUserActions } from '../../../../features/admin/service/useAdminUserActions';
import type {
  AdminIntegrityEventRow,
  AdminIntegrityStageSummary,
  AdminSpamFlagRow,
  AdminUserRow,
} from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import {
  AdminCard, AdminKpiCard, AdminQueueItem, AdminSplit, AdminTableWrap, TabState,
} from '../layout';
import UserIdentity from '../UserIdentity';
import { useAdminViewMode } from '../viewMode';

const UserDetail = lazy(() => import('./UserDetail'));

const NO_USERS: AdminUserRow[] = [];
const NO_FLAGS: AdminSpamFlagRow[] = [];
const NO_STAGES: AdminIntegrityStageSummary[] = [];
const NO_EVENTS: AdminIntegrityEventRow[] = [];
const RARITY_KEYS = ['common', 'rare', 'epic', 'legendary'] as const;

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

export default function AntiAbuseTab({ onCompose }: { onCompose?: (userId: string) => void } = {}) {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const { viewMode } = useAdminViewMode();
  const actions = useAdminUserActions();
  const integrity = useAdminIntegrity(granted);

  const usersQuery = useAdminQuery(adminKeys.users, readAdminUsers, granted);
  const flagsQuery = useAdminQuery(adminKeys.spamFlags, readAdminSpamFlags, granted);

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const users = usersQuery.data ?? NO_USERS;
  const flags = flagsQuery.data ?? NO_FLAGS;
  const stages = integrity.stages.data ?? NO_STAGES;
  const integrityEvents = integrity.events.data ?? NO_EVENTS;
  const integrityMetrics = integrity.metrics.data;

  const loading = usersQuery.loading || flagsQuery.loading || integrity.stages.loading;
  const error =
    usersQuery.error
    ?? flagsQuery.error
    ?? integrity.stages.error
    ?? integrity.events.error
    ?? integrity.metrics.error;
  const refresh = () => {
    usersQuery.refresh();
    flagsQuery.refresh();
    integrity.refresh();
  };

  const identityOf = adminIdentityLookup(users);
  const userByUid = useMemo(() => new Map(users.map(u => [u.user_id.toLowerCase(), u])), [users]);

  const { spamUsers, perfectOutliers, restricted } = useMemo(
    () => selectAntiAbuseRows(users, flags), [users, flags],
  );

  const pressuredAccounts = useMemo(
    () => stages.flatMap(s => s.accounts).filter(a => a.stage > 0 || a.pressure > 0),
    [stages],
  );
  const stageCount = (stageNum: number) => stages.find(s => s.stage === stageNum)?.count ?? 0;

  const releaseRestriction = async (userId: string) => {
    setBusyUid(userId);
    setActionError(null);
    try {
      await actions.restrict(userId, false);
    } catch (e) {
      setActionError(String((e as { message?: unknown }).message ?? e));
    } finally {
      setBusyUid(null);
    }
  };

  const releaseIntegrity = async (userId: string) => {
    setBusyUid(userId);
    setActionError(null);
    try {
      await integrity.releaseStage(userId);
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
    <div className="flex flex-col gap-3">
      <TabState loading={loading && granted} error={error} onRetry={refresh} />
      {actionError && <Note tone="warn" className="my-0">{actionError}</Note>}

      {!granted && (
        <Note size="xs" className="my-0">운영 DB에 연결하면 채워져요.</Note>
      )}

      {/* 요약 보기 기본: 깔끔한 2열 1행 (활성 제재 현황 + 무결성 단계 현황) */}
      <AdminSplit variant="2">
        <AdminCard
          title="활성 제재 현황"
          badge={<Badge tone={restricted.length > 0 ? 'danger' : 'dim'} size="xs">{restricted.length}건 활성</Badge>}
        >
          <AdminTableWrap>
            <DataTable className="pf-admin-table">
              <thead>
                <tr>
                  <th>플레이어</th>
                  <th>상태</th>
                  <th>최근 활동</th>
                  <th className="text-right">조치</th>
                </tr>
              </thead>
              <tbody>
                {granted && restricted.map(u => {
                  const busy = busyUid === u.user_id;
                  return (
                    <tr key={u.user_id}>
                      <td><UserIdentity user={u} /></td>
                      <td><Badge tone="danger" size="xs">제재 중</Badge></td>
                      <td className="whitespace-nowrap text-2xs text-text-dim">{fmtDT(u.last_action_at)}</td>
                      <td className="whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button size="xs" variant="primary" disabled={busy}
                                  onClick={() => void releaseRestriction(u.user_id)}>
                            해제
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => setSelectedUid(u.user_id)}>
                            상세
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(!granted || restricted.length === 0) && (
                  <tr>
                    <td colSpan={4} className="text-text-dim text-center py-3">
                      {granted ? '활성 제재가 없어요.' : '운영 DB에 연결하면 확인할 수 있어요.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          </AdminTableWrap>
        </AdminCard>

        <AdminCard
          title="무결성 단계 현황"
          badge={<Badge tone={pressuredAccounts.length > 0 ? 'gold' : 'dim'} size="xs">감등 {pressuredAccounts.length}명</Badge>}
        >
          <AdminSplit variant="3">
            <AdminKpiCard label="단계 0 (정상)" value={fmtNum(stageCount(0))} />
            <AdminKpiCard label="단계 1 (관찰)" value={fmtNum(stageCount(1))} tone={stageCount(1) > 0 ? 'warn' : 'dim'} />
            <AdminKpiCard label="단계 2 (감등)" value={fmtNum(stageCount(2))} tone={stageCount(2) > 0 ? 'danger' : 'dim'} />
          </AdminSplit>

          <div className="pf-admin-queue-list">
            {pressuredAccounts.map(a => {
              const busy = busyUid === a.userId;
              return (
                <AdminQueueItem key={a.userId} tone={a.stage >= 2 ? 'urgent' : 'warn'}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <UserIdentity user={identityOf(a.userId)} inline />
                      <Badge tone={a.stage >= 2 ? 'danger' : 'gold'} size="xs">단계 {a.stage}</Badge>
                    </div>
                    <div className="text-2xs text-text-dim mt-0.5">
                      압력 {a.pressure.toFixed(2)} / 배율 {a.modifier !== null ? `×${a.modifier}` : '—'} · {fmtDT(a.updatedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="xs" variant="primary" disabled={!granted || busy}
                            onClick={() => void releaseIntegrity(a.userId)}>
                      오탐 해제
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setSelectedUid(a.userId)}>
                      상세
                    </Button>
                  </div>
                </AdminQueueItem>
              );
            })}
            {pressuredAccounts.length === 0 && (
              <AdminQueueItem>
                <span className="text-xs text-text-dim">
                  {granted ? '무결성 감등 대상 계정이 없어요.' : '운영 DB에 연결하면 확인할 수 있어요.'}
                </span>
              </AdminQueueItem>
            )}
          </div>
        </AdminCard>
      </AdminSplit>

      {viewMode === 'detail' && (
        <>
          <AdminSplit variant="2">
            <AdminCard title="무결성 등급 분포 비교 (7일)">
              <AdminTableWrap>
                <DataTable className="pf-admin-table">
                  <thead>
                    <tr>
                      <th>등급</th>
                      <th className="text-right">정상 실측</th>
                      <th className="text-right">정상 기대</th>
                      <th className="text-right">감등 실측</th>
                      <th className="text-right">감등 기대</th>
                    </tr>
                  </thead>
                  <tbody>
                    {integrityMetrics ? RARITY_KEYS.map(r => (
                      <tr key={r}>
                        <td>{adminGradeName(r)}</td>
                        <td className="text-right">{(integrityMetrics.clean.shares[r] * 100).toFixed(1)}%</td>
                        <td className="text-right text-text-dim">{(integrityMetrics.clean.expectedShares[r] * 100).toFixed(1)}%</td>
                        <td className="text-right text-gold">{(integrityMetrics.pressured.shares[r] * 100).toFixed(1)}%</td>
                        <td className="text-right text-text-dim">{(integrityMetrics.pressured.expectedShares[r] * 100).toFixed(1)}%</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5} className="text-text-dim text-center py-3">
                        {granted ? '지표 데이터가 없어요.' : '—'}
                      </td></tr>
                    )}
                  </tbody>
                </DataTable>
              </AdminTableWrap>
            </AdminCard>

            <AdminCard title={`무결성 전환 로그 (${integrityEvents.length})`}>
              <AdminTableWrap scroll>
                <DataTable className="pf-admin-table">
                  <thead>
                    <tr>
                      <th>시각</th>
                      <th>유저</th>
                      <th>감지기</th>
                      <th className="text-right">압력</th>
                      <th className="text-right">단계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {integrityEvents.map(ev => (
                      <tr key={ev.id} className="cursor-pointer" onClick={() => setSelectedUid(ev.userId)}>
                        <td className="text-2xs text-text-dim whitespace-nowrap">{fmtDT(ev.createdAt)}</td>
                        <td><UserIdentity user={identityOf(ev.userId)} /></td>
                        <td className="text-xs">{ev.detector}</td>
                        <td className="text-right text-2xs">{ev.pressureBefore.toFixed(1)} → {ev.pressureAfter.toFixed(1)}</td>
                        <td className="text-right text-2xs pf-accent">{ev.stageBefore} → {ev.stageAfter}</td>
                      </tr>
                    ))}
                    {integrityEvents.length === 0 && (
                      <tr><td colSpan={5} className="text-text-dim text-center py-3">
                        {granted ? '전환 로그가 없어요.' : '—'}
                      </td></tr>
                    )}
                  </tbody>
                </DataTable>
              </AdminTableWrap>
            </AdminCard>
          </AdminSplit>

          <AdminSplit variant="2">
            <AdminCard title="연타 (낚시 간격 2초 미만, 최근 7일)">
              <Note size="2xs" className="my-0">
                최근 7일 내 2초 미만 간격으로 기록된 캐치를 관측해요.
              </Note>
              <AdminTableWrap>
                <DataTable className="pf-admin-table">
                  <thead>
                    <tr>
                      <th>유저</th>
                      <th className="text-right">7일 낚시</th>
                      <th className="text-right">연타 건수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spamUsers.map(f => (
                      <tr key={f.user_id} className="cursor-pointer" onClick={() => setSelectedUid(f.user_id)}>
                        <td><UserIdentity user={identityOf(f.user_id)} /></td>
                        <td className="text-right">{f.catches_7d}</td>
                        <td className={cx('text-right pf-accent', f.fast_gap_7d > 10 ? 'text-danger' : 'text-gold')}>
                          {f.fast_gap_7d}
                        </td>
                      </tr>
                    ))}
                    {spamUsers.length === 0 && (
                      <tr><td colSpan={3} className="text-text-dim text-center py-2">
                        {granted ? '연타가 없어요.' : '—'}
                      </td></tr>
                    )}
                  </tbody>
                </DataTable>
              </AdminTableWrap>
            </AdminCard>

            <AdminCard title="PERFECT 판정 비율 이상치 (7일)">
              <Note size="2xs" className="my-0">
                30일 전체 평균은 {(flags[0]?.perfect_pct_global ?? '—')}%예요 (7일 20낚시 이상).
              </Note>
              <AdminTableWrap>
                <DataTable className="pf-admin-table">
                  <thead>
                    <tr>
                      <th>유저</th>
                      <th className="text-right">7일 PERFECT%</th>
                      <th className="text-right">30일 전체%</th>
                      <th className="text-right">7일 낚시</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfectOutliers.map(f => (
                      <tr key={f.user_id} className="cursor-pointer" onClick={() => setSelectedUid(f.user_id)}>
                        <td><UserIdentity user={identityOf(f.user_id)} /></td>
                        <td className="text-right text-danger pf-accent">{f.perfect_pct}%</td>
                        <td className="text-right text-text-dim">{f.perfect_pct_global}%</td>
                        <td className="text-right">{f.catches_7d}</td>
                      </tr>
                    ))}
                    {perfectOutliers.length === 0 && (
                      <tr><td colSpan={4} className="text-text-dim text-center py-2">
                        {granted ? '이상치가 없어요.' : '—'}
                      </td></tr>
                    )}
                  </tbody>
                </DataTable>
              </AdminTableWrap>
            </AdminCard>
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
