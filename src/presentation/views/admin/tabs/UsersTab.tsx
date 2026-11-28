// 검색·명부 구역 — 서버 측 계정 검색(searchAdminUsers), 4종 필터(전체·접속 중·제재 중·무결성 감등), 7열 압축 표, 인라인 상세·조치 패널을 제공한다.
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import CheckToggle from '../../../ui/CheckToggle';
import DataTable from '../../../ui/DataTable';
import Inset from '../../../ui/Inset';
import Note from '../../../ui/Note';
import TextInput from '../../../ui/TextInput';
import ToggleChip from '../../../ui/ToggleChip';
import { fmtNum, fmtDT } from '../../../../features/admin/model/metrics';
import { adminNumber, filterAdminUsers, splitDormantGuests } from '../../../../features/admin/model/adminViews';
import { fmtDuration } from '../../../../features/admin/model/dashboard';
import { formatAdminLocation } from '../../../../features/admin/model/regions';
import { readAdminUsers, searchAdminUsers } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminIntegrity } from '../../../../features/admin/service/useAdminIntegrity';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminLive } from '../../../../features/admin/service/useAdminStats';
import { useAdminUserActions } from '../../../../features/admin/service/useAdminUserActions';
import type { AdminUserRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { AdminCard, AdminTableWrap, TabState } from '../layout';
import UserIdentity from '../UserIdentity';
import { useAdminViewMode } from '../viewMode';
import { boatNameOf } from '../../../../game/content/boats';

const UserDetail = lazy(() => import('./UserDetail'));

type QuickFilter = 'all' | 'online' | 'restricted' | 'integrity';

const NO_USERS: AdminUserRow[] = [];

export default function UsersTab({ onCompose }: {
  /** 이 계정을 받는 사람으로 넣고 우편 쓰기를 연다 */
  onCompose: (userId: string) => void;
}) {
  const { access, canViewEmail } = useAdminAuth();
  const granted = access === 'granted';
  const { viewMode } = useAdminViewMode();
  const actions = useAdminUserActions();

  const usersQuery = useAdminQuery(adminKeys.users, readAdminUsers, granted);
  const liveQuery = useAdminLive();
  const integrity = useAdminIntegrity(granted);
  const users = usersQuery.data ?? NO_USERS;

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [showDormant, setShowDormant] = useState(false);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [revokingUid, setRevokingUid] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const timer = setTimeout(() => setDebouncedQuery(trimmed), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const activeQuery = query.trim() ? debouncedQuery : '';
  const searchEnabled = granted && activeQuery.length > 0;
  const searchQuery = useAdminQuery(
    adminKeys.userSearch(activeQuery),
    () => searchAdminUsers(activeQuery, 25),
    searchEnabled,
  );

  const onlineUids = useMemo(
    () => new Set((liveQuery.data?.online ?? []).map(u => u.uid.toLowerCase())),
    [liveQuery.data],
  );

  const integrityByUid = useMemo(() => {
    const map = new Map<string, { stage: number; pressure: number; modifier: number | null }>();
    for (const s of integrity.stages.data ?? []) {
      for (const a of s.accounts) {
        if (a.stage > 0) map.set(a.userId.toLowerCase(), a);
      }
    }
    return map;
  }, [integrity.stages.data]);

  const { active, dormant } = useMemo(() => splitDormantGuests(users), [users]);

  const baseRows = useMemo(() => {
    if (searchEnabled && searchQuery.data) return searchQuery.data;
    if (activeQuery.length > 0) return filterAdminUsers(showDormant ? users : active, activeQuery);
    return showDormant ? users : active;
  }, [searchEnabled, searchQuery.data, activeQuery, showDormant, users, active]);

  const filtered = useMemo(() => {
    if (quickFilter === 'online') return baseRows.filter(u => onlineUids.has(u.user_id.toLowerCase()));
    if (quickFilter === 'restricted') return baseRows.filter(u => u.restricted === true);
    if (quickFilter === 'integrity') return baseRows.filter(u => integrityByUid.has(u.user_id.toLowerCase()));
    return baseRows;
  }, [baseRows, quickFilter, onlineUids, integrityByUid]);

  const current = selected && (filtered.find(u => u.user_id === selected.user_id)
    ?? users.find(u => u.user_id === selected.user_id)
    ?? selected);

  const selectPlayer = (u: AdminUserRow) => {
    setSelected(u);
    setModalOpen(false);
    setActionMsg(null);
    setActionError(null);
  };

  const toggleRestrict = async (u: AdminUserRow) => {
    setBusyUid(u.user_id);
    setActionError(null);
    setActionMsg(null);
    try {
      const next = u.restricted !== true;
      await actions.restrict(u.user_id, next);
      setActionMsg(next ? '제재를 적용했어요.' : '제재를 해제했어요.');
    } catch (e) {
      setActionError(String((e as { message?: unknown }).message ?? e));
    } finally {
      setBusyUid(null);
    }
  };

  const revokeSessions = async (u: AdminUserRow) => {
    setRevokingUid(u.user_id);
    setActionError(null);
    setActionMsg(null);
    try {
      const res = await actions.revokeSessions(u.user_id);
      setActionMsg(`세션 ${res.revoked}건을 강제 종료했어요.`);
    } catch (e) {
      setActionError(String((e as { message?: unknown }).message ?? e));
    } finally {
      setRevokingUid(null);
    }
  };

  const loading = usersQuery.loading || (searchEnabled && searchQuery.loading);
  const error = usersQuery.error ?? (searchEnabled ? searchQuery.error : null);
  const refresh = () => {
    usersQuery.refresh();
    if (searchEnabled) searchQuery.refresh();
  };

  const currentIntegrity = current ? integrityByUid.get(current.user_id.toLowerCase()) : undefined;

  const directoryCard = (
    <AdminCard title="유저 명부" badge={<span className="text-2xs text-text-dim">{filtered.length}/{users.length}명</span>}>
        <div className="flex flex-wrap items-center gap-3">
          <TextInput
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={canViewEmail ? '닉네임·이메일·UUID 검색' : '닉네임·UUID 검색'}
            className="w-[260px]"
            aria-label="유저 검색"
          />
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="명부 빠른 필터">
            <ToggleChip variant="choice" size="sm" pressed={quickFilter === 'all'}
                        onClick={() => setQuickFilter('all')}>
              전체
            </ToggleChip>
            <ToggleChip variant="choice" size="sm" pressed={quickFilter === 'online'}
                        onClick={() => setQuickFilter('online')}>
              접속 중
            </ToggleChip>
            <ToggleChip variant="choice" size="sm" pressed={quickFilter === 'restricted'}
                        onClick={() => setQuickFilter('restricted')}>
              제재 중
            </ToggleChip>
            <ToggleChip variant="choice" size="sm" pressed={quickFilter === 'integrity'}
                        onClick={() => setQuickFilter('integrity')}>
              무결성 감등
            </ToggleChip>
          </div>
          {activeQuery.length === 0 && (
            <CheckToggle checked={showDormant} onChange={setShowDormant}
                         label={`휴면 게스트 보기 (${dormant.length}명)`} />
          )}
        </div>

        <AdminTableWrap scroll>
          <DataTable className="pf-admin-table">
            <thead>
              <tr>
                <th>플레이어</th>
                <th>배</th>
                <th className="text-right">명성</th>
                <th className="text-right">골드</th>
                <th>상태</th>
                <th>최근 활동</th>
                <th className="text-right">즉시 액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const isOnline = onlineUids.has(u.user_id.toLowerCase());
                const restricted = u.restricted === true;
                const integ = integrityByUid.get(u.user_id.toLowerCase());
                const busy = busyUid === u.user_id;
                const isSelected = current?.user_id === u.user_id;
                return (
                  <tr
                    key={u.user_id}
                    onClick={() => selectPlayer(u)}
                    className={isSelected ? 'cursor-pointer is-selected' : 'cursor-pointer'}
                  >
                    <td><UserIdentity user={u} /></td>
                    <td className="whitespace-nowrap text-xs">{boatNameOf(u.boat ?? 0)}</td>
                    <td className="text-right pf-accent">{fmtNum(adminNumber(u.fame))}</td>
                    <td className="text-right pf-accent text-gold">{fmtNum(adminNumber(u.gold))}</td>
                    <td className="whitespace-nowrap">
                      <div className="inline-flex flex-wrap items-center gap-1">
                        <Badge tone={isOnline ? 'accent' : 'dim'} size="xs">
                          {isOnline ? '접속' : '미접속'}
                        </Badge>
                        {restricted && <Badge tone="danger" size="xs">제재</Badge>}
                        {integ && <Badge tone="gold" size="xs">감등 {integ.stage}</Badge>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-2xs text-text-dim">{fmtDT(u.last_action_at)}</td>
                    <td className="whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <Button size="xs" variant="ghost" onClick={() => onCompose(u.user_id)}>
                          우편
                        </Button>
                        <Button
                          size="xs"
                          variant={restricted ? 'ghost' : 'danger'}
                          disabled={!granted || busy || u.restricted === null}
                          onClick={() => void toggleRestrict(u)}
                        >
                          {restricted ? '해제' : '제재'}
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => selectPlayer(u)}>
                          상세
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-text-dim text-center py-4">
                    {granted ? '검색 결과가 없어요.' : '운영 DB에 연결하면 유저 명부가 채워져요.'}
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>
        </AdminTableWrap>
      </AdminCard>
  );

  return (
    <div className="flex flex-col gap-3">
      <TabState loading={granted && loading} error={error} onRetry={refresh} />
      {actionError && <Note tone="warn" className="my-0">{actionError}</Note>}

      <div className={current ? 'pf-admin-master-detail' : undefined}>
        {directoryCard}
        {current && (
          <div className="pf-admin-detail-sticky">
            <AdminCard
              title={
                <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="shrink-0">플레이어 상세·조치</span>
                  <UserIdentity user={current} inline className="flex-wrap" />
                </span>
              }
              actions={
                <div className="inline-flex shrink-0 items-center gap-1.5">
                  <Badge tone={canViewEmail ? 'accent' : 'dim'} size="xs">
                    {canViewEmail ? '관리자 열람' : '비식별 모드'}
                  </Badge>
                  <Button size="xs" variant="ghost" onClick={() => { setSelected(null); setModalOpen(false); }}>
                    닫기
                  </Button>
                </div>
              }
            >
              {actionMsg && <Note size="xs" className="my-0 text-accent">{actionMsg}</Note>}
              <div className="flex flex-col gap-2.5">
                <Inset tone="deep" className="flex flex-col gap-3 p-3">
                  <div className="text-xs font-bold text-text">계정 요약 및 즉시 조치</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span>골드: <strong className="pf-accent text-gold">{fmtNum(adminNumber(current.gold))}</strong></span>
                    <span>명성: <strong className="pf-accent">{fmtNum(adminNumber(current.fame))}</strong></span>
                    <span>배: <strong>{boatNameOf(current.boat ?? 0)}</strong></span>
                    <span>낚싯대: <strong>{current.rod ?? '—'}</strong></span>
                    <span>위치: <strong>{formatAdminLocation({ kind: current.location_kind, id: current.location_id })}</strong></span>
                    <span>플레이: <strong>{fmtDuration(current.total_session_sec)}</strong></span>
                    {viewMode === 'detail' && canViewEmail && current.email && (
                      <span>이메일: <strong className="select-text">{current.email}</strong></span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="accent" onClick={() => onCompose(current.user_id)}>
                      우편 보내기
                    </Button>
                    <Button
                      size="sm"
                      variant={current.restricted === true ? 'ghost' : 'danger'}
                      disabled={!granted || busyUid === current.user_id || current.restricted === null}
                      onClick={() => void toggleRestrict(current)}
                    >
                      {current.restricted === true ? '제재 해제' : '제재'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!granted || revokingUid === current.user_id}
                      onClick={() => void revokeSessions(current)}
                    >
                      세션 강제 종료
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => setModalOpen(true)}>
                      전체 상세 모달
                    </Button>
                  </div>
                </Inset>

                <Inset tone="deep" className="flex flex-col gap-2 p-3">
                  <div className="text-xs font-bold text-text">제재·무결성 상태</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span>제재 상태:</span>
                    <Badge tone={current.restricted === true ? 'danger' : 'dim'} size="xs">
                      {current.restricted === true ? '제재 중' : '정상'}
                    </Badge>
                    <span>무결성 단계:</span>
                    <Badge tone={currentIntegrity ? 'gold' : 'dim'} size="xs">
                      {currentIntegrity ? `단계 ${currentIntegrity.stage}` : '단계 0 (정상)'}
                    </Badge>
                    {currentIntegrity && (
                      <span className="text-2xs text-text-dim">
                        압력 {currentIntegrity.pressure.toFixed(2)} / 배율 {currentIntegrity.modifier !== null ? `×${currentIntegrity.modifier}` : '—'}
                      </span>
                    )}
                  </div>
                  <Note size="2xs" className="my-0">
                    기간별 제재 프리셋과 누적 이력은 추후 연동 예정이에요.
                  </Note>
                </Inset>
              </div>
            </AdminCard>
          </div>
        )}
      </div>

      {/* 전체 상세 모달은 칸 밖에 둔다 — [전체 상세 모달] 버튼으로 드릴다운 */}
      {modalOpen && current && (
        <Suspense fallback={null}>
          <UserDetail key={current.user_id} user={current} onClose={() => setModalOpen(false)} onCompose={onCompose} />
        </Suspense>
      )}
    </div>
  );
}
