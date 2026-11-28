// 제재·무결성 구역 — 활성 제재, 무결성 감등 현황·오탐 해제·전환 로그·분포 비교, 연타·PERFECT 이상치를 확인한다.
import { Suspense, lazy, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import DataTable from '../../../ui/DataTable';
import KpiTile from '../../../ui/KpiTile';
import Note from '../../../ui/Note';
import TableBox from '../../../ui/TableBox';
import { cx } from '../../../ui/cx';
import { adminGradeName, fmtNum, fmtDT } from '../../../../features/admin/model/metrics';
import { adminIdentityLookup, adminNumber, selectAntiAbuseRows } from '../../../../features/admin/model/adminViews';
import {
  readAdminIntegrityEvents,
  readAdminIntegrityMetrics,
  readAdminIntegrityStages,
  readAdminSpamFlags,
  readAdminUsers,
  releaseAdminIntegrityStage,
} from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminUserActions } from '../../../../features/admin/service/useAdminUserActions';
import type {
  AdminIntegrityEventRow,
  AdminIntegrityStageSummary,
  AdminSpamFlagRow,
  AdminUserRow,
} from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Cell, CellGrid, KpiRow, TabState } from '../layout';
import UserIdentity from '../UserIdentity';

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
  const queryClient = useQueryClient();
  const actions = useAdminUserActions();

  const usersQuery = useAdminQuery(adminKeys.users, readAdminUsers, granted);
  const flagsQuery = useAdminQuery(adminKeys.spamFlags, readAdminSpamFlags, granted);
  const stagesQuery = useAdminQuery(adminKeys.integrityStages, readAdminIntegrityStages, granted);
  const eventsQuery = useAdminQuery(
    adminKeys.integrityEvents(undefined, 50),
    () => readAdminIntegrityEvents(undefined, 50),
    granted,
  );
  const metricsQuery = useAdminQuery(
    adminKeys.integrityMetrics(7),
    () => readAdminIntegrityMetrics(7),
    granted,
  );

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const users = usersQuery.data ?? NO_USERS;
  const flags = flagsQuery.data ?? NO_FLAGS;
  const stages = stagesQuery.data ?? NO_STAGES;
  const integrityEvents = eventsQuery.data ?? NO_EVENTS;
  const integrityMetrics = metricsQuery.data;

  const loading = usersQuery.loading || flagsQuery.loading || stagesQuery.loading;
  const error = usersQuery.error ?? flagsQuery.error ?? stagesQuery.error ?? eventsQuery.error ?? metricsQuery.error;
  const refresh = () => {
    usersQuery.refresh();
    flagsQuery.refresh();
    stagesQuery.refresh();
    eventsQuery.refresh();
    metricsQuery.refresh();
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

  const tone = (count: number, active: 'gold' | 'danger') => (count > 0 ? active : 'dim');

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
      await releaseAdminIntegrityStage(userId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.integrityStages }),
        queryClient.invalidateQueries({ queryKey: adminKeys.integrityEvents(undefined, 50) }),
        queryClient.invalidateQueries({ queryKey: adminKeys.integrityMetrics(7) }),
      ]);
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
    <>
      <TabState loading={loading && granted} error={error} onRetry={refresh} />
      {actionError && <Note tone="warn" className="my-0">{actionError}</Note>}

      {!granted && (
        <Note className="my-0">운영 DB에 연결하거나 admins에 등록하면 채워져요. 화면 구성은 아래와 같아요.</Note>
      )}

      <KpiRow>
        <KpiTile label="연타 유저" value={fmtNum(spamUsers.length)} hint="최근 7일, 낚시 간격 2초 미만"
                 tone={tone(spamUsers.length, 'gold')} />
        <KpiTile label="PERFECT 이상치" value={fmtNum(perfectOutliers.length)} hint="7일 20낚시 이상"
                 tone={tone(perfectOutliers.length, 'danger')} />
        <KpiTile label="제재 계정" value={fmtNum(restricted.length)}
                 tone={tone(restricted.length, 'danger')} />
        <KpiTile label="무결성 감등" value={fmtNum(pressuredAccounts.length)} hint="단계 1~2 압력 누적"
                 tone={tone(pressuredAccounts.length, 'gold')} />
      </KpiRow>

      <Cell title={`활성 제재 계정 (${restricted.length})`} flush divided>
        {!granted || restricted.length === 0 ? (
          <Note size="2xs" className="my-0 px-3 py-2">
            {granted ? '활성 제재가 없어요.' : '운영 DB에 연결하면 확인할 수 있어요.'}
          </Note>
        ) : restricted.map(u => {
          const gold = adminNumber(u.gold);
          const fame = adminNumber(u.fame);
          const details = [
            Number.isFinite(gold) ? `골드 ${fmtNum(gold)}` : null,
            Number.isFinite(fame) ? `명성 ${fmtNum(fame)}` : null,
            u.last_action_at ? `마지막 행동 ${fmtDT(u.last_action_at)}` : null,
          ].filter(Boolean).join(' / ');
          const busy = busyUid === u.user_id;
          return (
            <div key={u.user_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <UserIdentity user={u} />
                {details && <span className="text-xs text-text-dim">{details}</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setSelectedUid(u.user_id)}>상세</Button>
                <Button size="sm" variant="primary" disabled={busy}
                        onClick={() => void releaseRestriction(u.user_id)}>
                  제재 해제
                </Button>
              </div>
            </div>
          );
        })}
      </Cell>

      {/* 무결성 감등 현황 및 오탐 해제 */}
      <Cell title="무결성 감등 현황 (단계 0/1/2)" flush>
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
          <Badge tone="dim" size="xs">단계 0 (정상): {fmtNum(stageCount(0))}명</Badge>
          <Badge tone="gold" size="xs">단계 1 (주의): {fmtNum(stageCount(1))}명</Badge>
          <Badge tone="danger" size="xs">단계 2 (감등): {fmtNum(stageCount(2))}명</Badge>
        </div>
        <TableBox className="px-1 pb-1">
          <DataTable>
            <thead>
              <tr>
                <th className="text-left">유저</th>
                <th className="text-right">단계</th>
                <th className="text-right">압력</th>
                <th className="text-right">보정 배율</th>
                <th className="text-left">갱신 시각</th>
                <th className="text-right">조치</th>
              </tr>
            </thead>
            <tbody>
              {pressuredAccounts.map(a => {
                const busy = busyUid === a.userId;
                return (
                  <tr key={a.userId} className="cursor-pointer hover:bg-surface-2 transition"
                      onClick={() => setSelectedUid(a.userId)}>
                    <td><UserIdentity user={identityOf(a.userId)} /></td>
                    <td className="text-right pf-accent">
                      <span className={a.stage >= 2 ? 'text-danger' : 'text-gold'}>{a.stage}단계</span>
                    </td>
                    <td className="text-right">{a.pressure.toFixed(2)}</td>
                    <td className="text-right">{a.modifier !== null ? `×${a.modifier}` : '—'}</td>
                    <td className="text-2xs text-text-dim whitespace-nowrap">{fmtDT(a.updatedAt)}</td>
                    <td className="text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <Button size="xs" variant="ghost" onClick={() => setSelectedUid(a.userId)}>상세</Button>
                        <Button size="xs" variant="primary" disabled={!granted || busy}
                                onClick={() => void releaseIntegrity(a.userId)}>
                          오탐 해제
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pressuredAccounts.length === 0 && (
                <tr><td colSpan={6} className="text-text-dim text-center py-3">
                  {granted ? '무결성 감등 대상 계정이 없어요.' : '—'}
                </td></tr>
              )}
            </tbody>
          </DataTable>
        </TableBox>
      </Cell>

      <CellGrid>
        <Cell title="무결성 등급 분포 비교 (7일)" flush>
          <TableBox className="px-1 pb-1">
            <DataTable>
              <thead>
                <tr>
                  <th className="text-left">등급</th>
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
          </TableBox>
        </Cell>

        <Cell title={`무결성 전환 로그 (${integrityEvents.length})`} flush>
          <TableBox className="max-h-[320px] px-1 pb-1">
            <DataTable>
              <thead>
                <tr>
                  <th className="text-left">시각</th>
                  <th className="text-left">유저</th>
                  <th className="text-left">감지기</th>
                  <th className="text-right">압력</th>
                  <th className="text-right">단계</th>
                </tr>
              </thead>
              <tbody>
                {integrityEvents.map(ev => (
                  <tr key={ev.id} className="cursor-pointer hover:bg-surface-2 transition"
                      onClick={() => setSelectedUid(ev.userId)}>
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
          </TableBox>
        </Cell>
      </CellGrid>

      {/* 행동 이상 — 낚시 간격과 판정율은 같은 "플레이 행위" 축이라 나란히 본다 */}
      <CellGrid>
        <Cell title="연타 (낚시 간격 2초 미만, 최근 7일)">
          <Note size="2xs" className="my-0">
            서버는 직전 액션과의 최소 간격(느림 창 페이싱)과 낚시 한 사이클 기준(catchTooSoon)으로 과속 요청을 차단해요.
            여기는 최근 7일 내 2초 미만 간격으로 기록된 캐치를 관측해요.
          </Note>
          <TableBox>
            <DataTable>
              <thead>
                <tr><th className="text-left">유저</th><th className="text-right">7일 낚시</th>
                    <th className="text-right">연타 건수</th></tr>
              </thead>
              <tbody>
                {spamUsers.map(f => (
                  <tr key={f.user_id} className="cursor-pointer hover:bg-surface-2 transition"
                      onClick={() => setSelectedUid(f.user_id)}>
                    <td><UserIdentity user={identityOf(f.user_id)} /></td>
                    <td className="text-right">{f.catches_7d}</td>
                    <td className={cx('text-right pf-accent',
                                      f.fast_gap_7d > 10 ? 'text-danger' : 'text-gold')}>
                      {f.fast_gap_7d}
                    </td>
                  </tr>
                ))}
                {spamUsers.length === 0 &&
                  <tr><td colSpan={3} className="text-text-dim text-center py-2">
                    {granted ? '연타가 없어요.' : '—'}
                  </td></tr>}
              </tbody>
            </DataTable>
          </TableBox>
        </Cell>

        <Cell title="PERFECT 판정 비율 이상치 (7일)">
          <Note size="2xs" className="my-0">
            30일 전체 평균은 {(flags[0]?.perfect_pct_global ?? '—')}%예요.
            PERFECT ×2는 클라이언트의 주장을 따르는 의도된 구멍이라서, 비율 감시가 유일한 대응이에요(7일 20낚시 이상).
          </Note>
          <TableBox>
            <DataTable>
              <thead>
                <tr><th className="text-left">유저</th><th className="text-right">7일 PERFECT%</th>
                    <th className="text-right">30일 전체%</th><th className="text-right">7일 낚시</th></tr>
              </thead>
              <tbody>
                {perfectOutliers.map(f => (
                  <tr key={f.user_id} className="cursor-pointer hover:bg-surface-2 transition"
                      onClick={() => setSelectedUid(f.user_id)}>
                    <td><UserIdentity user={identityOf(f.user_id)} /></td>
                    <td className="text-right text-danger pf-accent">{f.perfect_pct}%</td>
                    <td className="text-right text-text-dim">{f.perfect_pct_global}%</td>
                    <td className="text-right">{f.catches_7d}</td>
                  </tr>
                ))}
                {perfectOutliers.length === 0 &&
                  <tr><td colSpan={4} className="text-text-dim text-center py-2">
                    {granted ? '이상치가 없어요.' : '—'}
                  </td></tr>}
              </tbody>
            </DataTable>
          </TableBox>
        </Cell>
      </CellGrid>

      {detailUser && (
        <Suspense fallback={null}>
          <UserDetail key={detailUser.user_id} user={detailUser}
                      onClose={() => setSelectedUid(null)} onCompose={onCompose} />
        </Suspense>
      )}
    </>
  );
}
