// 검색·명부 구역 — 서버 측 계정 검색(searchAdminUsers)과 빠른 필터(전체·접속 중·제재 중), 행 원클릭 조치를 제공한다.
import { useEffect, useMemo, useState } from 'react';
import Button from '../../../ui/Button';
import CheckToggle from '../../../ui/CheckToggle';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import TableBox from '../../../ui/TableBox';
import TextInput from '../../../ui/TextInput';
import ToggleChip from '../../../ui/ToggleChip';
import { fmtNum, fmtDT } from '../../../../features/admin/model/metrics';
import { adminNumber, filterAdminUsers, splitDormantGuests } from '../../../../features/admin/model/adminViews';
import { fmtDuration } from '../../../../features/admin/model/dashboard';
import { formatAdminLocation } from '../../../../features/admin/model/regions';
import { readAdminUsers, searchAdminUsers } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminLive } from '../../../../features/admin/service/useAdminStats';
import { useAdminUserActions } from '../../../../features/admin/service/useAdminUserActions';
import type { AdminUserRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Cell, TabState } from '../layout';
import UserIdentity from '../UserIdentity';
import { boatNameOf } from '../../../../game/content/boats';
import UserDetail from './UserDetail';

type QuickFilter = 'all' | 'online' | 'restricted';

const NO_USERS: AdminUserRow[] = [];

export default function UsersTab({ onCompose }: {
  /** 이 계정을 받는 사람으로 넣고 우편 쓰기를 연다 */
  onCompose: (userId: string) => void;
}) {
  const { access, canViewEmail } = useAdminAuth();
  const granted = access === 'granted';
  const actions = useAdminUserActions();

  const usersQuery = useAdminQuery(adminKeys.users, readAdminUsers, granted);
  const liveQuery = useAdminLive();
  const users = usersQuery.data ?? NO_USERS;

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [showDormant, setShowDormant] = useState(false);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
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

  const { active, dormant } = useMemo(() => splitDormantGuests(users), [users]);

  const baseRows = useMemo(() => {
    if (searchEnabled && searchQuery.data) return searchQuery.data;
    if (activeQuery.length > 0) return filterAdminUsers(showDormant ? users : active, activeQuery);
    return showDormant ? users : active;
  }, [searchEnabled, searchQuery.data, activeQuery, showDormant, users, active]);

  const filtered = useMemo(() => {
    if (quickFilter === 'online') return baseRows.filter(u => onlineUids.has(u.user_id.toLowerCase()));
    if (quickFilter === 'restricted') return baseRows.filter(u => u.restricted === true);
    return baseRows;
  }, [baseRows, quickFilter, onlineUids]);

  const current = selected && (filtered.find(u => u.user_id === selected.user_id)
    ?? users.find(u => u.user_id === selected.user_id)
    ?? selected);

  const toggleRestrict = async (u: AdminUserRow) => {
    setBusyUid(u.user_id);
    setActionError(null);
    try {
      await actions.restrict(u.user_id, u.restricted !== true);
    } catch (e) {
      setActionError(String((e as { message?: unknown }).message ?? e));
    } finally {
      setBusyUid(null);
    }
  };

  const loading = usersQuery.loading || (searchEnabled && searchQuery.loading);
  const error = usersQuery.error ?? (searchEnabled ? searchQuery.error : null);
  const refresh = () => {
    usersQuery.refresh();
    if (searchEnabled) searchQuery.refresh();
  };

  return (
    <>
      <TabState loading={granted && loading} error={error} onRetry={refresh} />
      {actionError && <Note tone="warn" className="my-0">{actionError}</Note>}

      <Cell title="유저 명부" flush>
        <div className="flex flex-wrap items-center gap-3 px-3 pt-3">
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
          </div>
          <span className="text-2xs text-text-dim">{filtered.length}/{users.length}명</span>
          {activeQuery.length === 0 && (
            <CheckToggle checked={showDormant} onChange={setShowDormant}
                         label={`휴면 게스트 보기 (${dormant.length}명)`} />
          )}
        </div>

        <TableBox className="max-h-[640px] px-1 pb-1">
          <DataTable>
            <thead>
              <tr>
                <th className="text-left">식별</th><th className="text-left">상태</th>
                <th className="text-right">골드</th><th className="text-right">명성</th>
                <th className="text-left">배</th><th className="text-right">낚싯대</th>
                <th className="text-left">위치</th><th className="text-left">마지막 행동</th>
                <th className="text-left">마지막 세션</th><th className="text-right">누적 플레이</th>
                <th className="text-right">조치</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const restricted = u.restricted === true;
                const busy = busyUid === u.user_id;
                return (
                  <tr key={u.user_id} onClick={() => setSelected(u)}
                      className="cursor-pointer hover:bg-surface-2 transition">
                    <td><UserIdentity user={u} /></td>
                    <td>{restricted
                      ? <span className="text-danger text-2xs pf-accent">제재</span> : null}</td>
                    <td className="text-right">{fmtNum(adminNumber(u.gold))}</td>
                    <td className="text-right">{fmtNum(adminNumber(u.fame))}</td>
                    <td className="whitespace-nowrap text-xs">{boatNameOf(u.boat ?? 0)}</td>
                    <td className="text-right text-xs">{u.rod ?? '—'}</td>
                    <td className="whitespace-nowrap text-xs text-text-dim">
                      {formatAdminLocation({ kind: u.location_kind, id: u.location_id })}</td>
                    <td className="whitespace-nowrap text-2xs text-text-dim">{fmtDT(u.last_action_at)}</td>
                    <td className="whitespace-nowrap text-2xs text-text-dim">{fmtDT(u.last_session_at)}</td>
                    <td className="whitespace-nowrap text-right text-xs">{fmtDuration(u.total_session_sec)}</td>
                    <td className="whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <Button size="xs" variant="ghost" onClick={() => onCompose(u.user_id)}>
                          우편
                        </Button>
                        <Button
                          size="xs"
                          variant={restricted ? 'ghost' : 'primary'}
                          disabled={!granted || busy || u.restricted === null}
                          onClick={() => void toggleRestrict(u)}
                        >
                          {restricted ? '해제' : '제재'}
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setSelected(u)}>
                          상세
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="text-text-dim text-center py-4">
                  {granted ? '검색 결과가 없어요.' : '운영 DB에 연결하면 유저 명부가 채워져요.'}
                </td></tr>
              )}
            </tbody>
          </DataTable>
        </TableBox>
      </Cell>

      {/* 상세 모달은 칸 밖에 둔다 — 오목한 칸의 clip-path 안에서는 화면 전체를 덮는 모달이 잘린다 */}
      {current &&
        <UserDetail key={current.user_id} user={current} onClose={() => setSelected(null)} onCompose={onCompose} />}
    </>
  );
}
