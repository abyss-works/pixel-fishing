// 채팅 신고 구역 — 플레이어가 신고한 채팅 메시지와 앞뒤 대화(신고 시점의 복사본) 목록.
// 신고한 메시지 줄을 강조하고, 각 신고 행에서 대상 유저 상세(UserDetail)를 열거나 원클릭으로 제재/해제를 실행한다.
import { useState } from 'react';
import Button from '../../../ui/Button';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { cx } from '../../../ui/cx';
import { fmtDT } from '../../../../features/admin/model/metrics';
import { adminIdentityLookup } from '../../../../features/admin/model/adminViews';
import { readAdminChatReports, readAdminUsers } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminUserActions } from '../../../../features/admin/service/useAdminUserActions';
import type { AdminChatReportRow, AdminUserRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Cell, TabState } from '../layout';
import UserIdentity from '../UserIdentity';
import UserDetail from './UserDetail';

const NO_REPORTS: AdminChatReportRow[] = [];
const NO_USERS: AdminUserRow[] = [];

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

export default function ChatReportsSection({ onCompose }: {
  onCompose?: (userId: string) => void;
}) {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const reportsQuery = useAdminQuery(adminKeys.chatReports, readAdminChatReports, granted);
  const usersQuery = useAdminQuery(adminKeys.users, readAdminUsers, granted);
  const actions = useAdminUserActions();

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reports = reportsQuery.data ?? NO_REPORTS;
  const users = usersQuery.data ?? NO_USERS;
  const loading = reportsQuery.loading || usersQuery.loading;
  const error = reportsQuery.error ?? usersQuery.error;
  const refresh = () => {
    reportsQuery.refresh();
    usersQuery.refresh();
  };

  const identityOf = adminIdentityLookup(users);
  const userByUid = new Map(users.map(u => [u.user_id.toLowerCase(), u]));
  const targetUserOf = (uid: string) => userByUid.get(uid.toLowerCase()) ?? null;

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
    ? (targetUserOf(selectedUid) ?? fallbackUserRow(selectedUid))
    : null;

  return (
    <>
      <TabState loading={loading && granted} error={error} onRetry={refresh} />
      {actionError && <Note tone="warn" className="my-0">{actionError}</Note>}
      {!granted && <Note className="my-0">운영 DB에 연결하거나 admins에 등록하면 채워져요.</Note>}
      <Cell title={`채팅 신고 (${reports.length})`} flush>
        <div className="pf-scroll-panel max-h-[560px] overflow-auto px-1">
          <DataTable>
            <thead>
              <tr>
                <th className="text-left">시각</th>
                <th className="text-left">신고한 사람</th>
                <th className="text-left">보낸 사람</th>
                <th className="text-left">대화</th>
                <th className="text-left">조치</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => {
                const target = targetUserOf(r.target_id);
                const restricted = target?.restricted === true;
                const canRestrict = target !== null && target.restricted !== null;
                const busy = busyUid === r.target_id;
                return (
                  <tr key={r.id}>
                    <td className="text-2xs text-text-dim whitespace-nowrap align-top">{fmtDT(r.created_at)}</td>
                    <td className="align-top"><UserIdentity user={identityOf(r.user_id)} /></td>
                    <td className="align-top">
                      <div className="flex flex-col gap-1">
                        <UserIdentity user={identityOf(r.target_id)} />
                        {restricted && <span className="text-danger text-2xs pf-accent">제재됨</span>}
                      </div>
                    </td>
                    <td className="text-xs select-text">
                      {r.lines.map(l => (
                        <div key={l.id} className={cx('whitespace-pre-wrap', l.id === r.message_id ? 'text-danger' : 'text-text-dim')}>
                          <span className="text-accent">{l.nick}: </span>{l.text}
                        </div>
                      ))}
                    </td>
                    <td className="align-top whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setSelectedUid(r.target_id)}>
                          상세 보기
                        </Button>
                        <Button size="sm" variant={restricted ? 'ghost' : 'primary'}
                                disabled={!granted || busy || !canRestrict}
                                onClick={() => target && void toggleRestrict(target)}>
                          {restricted ? '제재 해제' : '제재'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {reports.length === 0 && (
                <tr><td colSpan={5} className="text-text-dim text-center py-3">신고가 없어요.</td></tr>
              )}
            </tbody>
          </DataTable>
        </div>
      </Cell>
      {detailUser && (
        <UserDetail key={detailUser.user_id} user={detailUser}
                    onClose={() => setSelectedUid(null)} onCompose={onCompose} />
      )}
    </>
  );
}
