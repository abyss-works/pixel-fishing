// 실시간·신고 구역 — 실시간 채널(WebSocket) 접속자 명부([우편]/[상세] 즉시 액션), 위치 분포, 채팅 신고를 표시한다.
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import Button from '../../../ui/Button';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { fmtDT, fmtNum } from '../../../../features/admin/model/metrics';
import { adminUserLabel } from '../../../../features/admin/model/adminViews';
import { fmtDuration, selectLiveBoard } from '../../../../features/admin/model/dashboard';
import { readAdminUsers } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminLive } from '../../../../features/admin/service/useAdminStats';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import type { AdminUserRow } from '../../../../features/admin/model/types';
import { BarsChart } from '../charts';
import { AdminCard, AdminKpiCard, AdminKpiGrid, AdminSplit, AdminTableWrap, TabState } from '../layout';
import UserIdentity from '../UserIdentity';
import { useAdminViewMode } from '../viewMode';
import ChatReportsSection from './ChatReportsSection';

const UserDetail = lazy(() => import('./UserDetail'));

const POLL_MS = 15_000;

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

export default function LiveTab({ onCompose }: {
  onCompose?: (userId: string) => void;
  embedded?: boolean;
} = {}) {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const { viewMode } = useAdminViewMode();
  const { data, loading, error, refresh } = useAdminLive(POLL_MS);
  const usersQuery = useAdminQuery(adminKeys.users, readAdminUsers, granted);
  const [tick, setTick] = useState(() => Date.now());
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  useEffect(() => {
    if (!granted) return;
    const t = setInterval(() => setTick(Date.now()), POLL_MS);
    return () => clearInterval(t);
  }, [granted]);

  const board = useMemo(() => selectLiveBoard(data, tick), [data, tick]);
  const count = (v: number) => (data ? fmtNum(v) : '—');
  const userByUid = useMemo(
    () => new Map((usersQuery.data ?? []).map(u => [u.user_id.toLowerCase(), u])),
    [usersQuery.data],
  );
  const detailUser = selectedUid
    ? (userByUid.get(selectedUid.toLowerCase()) ?? fallbackUserRow(selectedUid))
    : null;

  return (
    <div className="flex flex-col gap-3">
      {viewMode === 'detail' && (
        <AdminKpiGrid cols={4}>
          <AdminKpiCard label="지금 접속" value={count(data?.count ?? NaN)} sub="실시간 채널 연결" tone="accent" />
          <AdminKpiCard label="가입 계정" value={count(board.members)} />
          <AdminKpiCard label="게스트" value={count(board.guests)} />
          <AdminKpiCard
            label="가장 오래 접속"
            value={fmtDuration(board.rows[0]?.connectedSec)}
            sub={board.rows[0] && adminUserLabel(board.rows[0].identity)}
            tone="gold"
          />
        </AdminKpiGrid>
      )}

      <TabState loading={loading && granted && data === null} error={error} onRetry={refresh} />

      <AdminSplit variant="60-40">
        <AdminCard title={`접속 목록 (${board.rows.length})`}>
          <AdminTableWrap className="max-h-[420px] overflow-y-auto">
            <DataTable className="pf-admin-table">
              <thead>
                <tr>
                  <th>계정</th>
                  <th>위치</th>
                  <th className="text-right">접속 시간</th>
                  <th className="text-right">즉시 액션</th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map(row => (
                  <tr key={row.uid}>
                    <td><UserIdentity user={row.identity} /></td>
                    <td className="whitespace-nowrap text-xs">{row.place}</td>
                    <td className="whitespace-nowrap text-right text-xs" title={`${fmtDT(row.connectedAt)}부터`}>
                      {fmtDuration(row.connectedSec)}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-1">
                        {onCompose && (
                          <Button size="xs" variant="ghost" onClick={() => onCompose(row.uid)}>
                            우편
                          </Button>
                        )}
                        <Button size="xs" variant="ghost" onClick={() => setSelectedUid(row.uid)}>
                          상세
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {board.rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-text-dim text-center py-3">
                      {granted ? '지금 연결된 사람이 없어요.' : '운영 DB에 연결하면 채워져요.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          </AdminTableWrap>
        </AdminCard>

        <AdminCard title="위치 분포">
          <BarsChart values={board.places.values} labels={board.places.labels} height={96} highlight="peak"
                     ariaLabel="접속 중인 사람의 위치 분포" />
          <Note size="2xs" className="my-0">
            바다에 있는 사람은 지금 있는 해역으로, 해역을 모르면 지역으로 묶어요.
          </Note>
        </AdminCard>
      </AdminSplit>

      <ChatReportsSection onCompose={onCompose} />

      {detailUser && (
        <Suspense fallback={null}>
          <UserDetail key={detailUser.user_id} user={detailUser}
                      onClose={() => setSelectedUid(null)} onCompose={onCompose} />
        </Suspense>
      )}
    </div>
  );
}
