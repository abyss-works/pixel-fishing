// 편지 구역 — 유저가 보낸 편지(letters, 영구) 목록. events 7일 창 밖의 오래된 편지도 보인다
// 정규화된 편지 기록을 조회한다.
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { fmtDT } from '../../../../features/admin/model/metrics';
import { readAdminLetters } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Cell, TabState } from '../layout';

// 조회 전 골격 — 게이트는 내용을 교체하지 않으므로 빈 표를 그린다
const EMPTY: Awaited<ReturnType<typeof readAdminLetters>> = [[], []];

export default function LettersTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.letters, readAdminLetters, granted);

  const [letters, users] = data ?? EMPTY;

  const labelOf = (uid: string): string => {
    const u = users.find(x => x.user_id === uid);
    return u?.email ?? `${uid.slice(0, 8)}…`;
  };

  return (
    <>
      <TabState loading={loading && granted} error={error} onRetry={refresh} />
      {!granted && <Note className="my-0">운영 DB에 연결하거나 admins에 등록하면 채워져요.</Note>}
      <Cell title={`편지 (${letters.length})`} flush>
        <div className="pf-scroll-panel max-h-[560px] overflow-auto px-1">
          <DataTable>
            <thead>
              <tr>
                <th className="text-left">시각</th>
                <th className="text-left">보낸 사람</th>
                <th className="text-left">내용</th>
              </tr>
            </thead>
            <tbody>
              {letters.map(l => (
                <tr key={l.id}>
                  <td className="text-2xs text-text-dim whitespace-nowrap align-top">{fmtDT(l.created_at)}</td>
                  <td className="text-xs align-top">{labelOf(l.user_id)}</td>
                  <td className="text-xs whitespace-pre-wrap select-text">{l.text}</td>
                </tr>
              ))}
              {letters.length === 0 && (
                <tr><td colSpan={3} className="text-text-dim text-center py-3">편지가 없어요.</td></tr>
              )}
            </tbody>
          </DataTable>
        </div>
      </Cell>
    </>
  );
}
