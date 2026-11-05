// 채팅 신고 구역 — 플레이어가 신고한 채팅 메시지와 앞뒤 대화(신고 시점의 복사본) 목록. 읽기 전용이다.
// 신고한 메시지 줄을 강조하고, 신고자와 보낸 사람은 명부의 계정 식별 표기로 보인다. 제재는 SQL로 한다.
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { cx } from '../../../ui/cx';
import { fmtDT } from '../../../../features/admin/model/metrics';
import { adminIdentityLookup } from '../../../../features/admin/model/adminViews';
import { readAdminChatReports } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Cell, TabState } from '../layout';
import UserIdentity from '../UserIdentity';

// 조회 전 골격 — 게이트는 내용을 교체하지 않으므로 빈 표를 그린다
const EMPTY: Awaited<ReturnType<typeof readAdminChatReports>> = [[], []];

export default function ChatReportsSection() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.chatReports, readAdminChatReports, granted);

  const [reports, users] = data ?? EMPTY;

  const identityOf = adminIdentityLookup(users);

  return (
    <>
      <TabState loading={loading && granted} error={error} onRetry={refresh} />
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
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id}>
                  <td className="text-2xs text-text-dim whitespace-nowrap align-top">{fmtDT(r.created_at)}</td>
                  <td className="align-top"><UserIdentity user={identityOf(r.user_id)} /></td>
                  <td className="align-top"><UserIdentity user={identityOf(r.target_id)} /></td>
                  <td className="text-xs select-text">
                    {r.lines.map(l => (
                      <div key={l.id} className={cx('whitespace-pre-wrap', l.id === r.message_id ? 'text-danger' : 'text-text-dim')}>
                        <span className="text-accent">{l.nick}: </span>{l.text}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
              {reports.length === 0 && (
                <tr><td colSpan={4} className="text-text-dim text-center py-3">신고가 없어요.</td></tr>
              )}
            </tbody>
          </DataTable>
        </div>
      </Cell>
    </>
  );
}
