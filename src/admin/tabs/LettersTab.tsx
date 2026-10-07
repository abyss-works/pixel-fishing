// 편지 탭 — 유저가 보낸 편지(letters, 영구) 목록. events 7일 창 밖의 오래된 편지도 보인다
// (정규화의 착지점 — mgmt/spec/cold-archive.md 4절).
import { useEffect, useState } from 'react';
import DataTable from '../../ui/DataTable';
import Note from '../../ui/Note';
import { fmtDT } from '../metrics';
import { api } from '../../api';
import type { AdminLetterRow, AdminUserRow } from '../../api';
import { useAdminAuth } from '../accessContext';
import { TabState } from '../charts';

export default function LettersTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [letters, setLetters] = useState<AdminLetterRow[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);

  const run = () =>
    Promise.all([api.admin.letters(), api.admin.users()])
      .then(([ls, us]) => { setLetters(ls); setUsers(us); })
      .then(() => setLoading(false), e => { setError(String(e?.message ?? e)); setLoading(false); });

  useEffect(() => {
    // granted가 된 순간 조회 — 그 전엔 빈 골격만 (AntiAbuseTab과 같은 계약)
    if (!granted) { setLoading(false); return; }
    void run();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 판정 완료 시점 실행
  }, [granted]);

  const labelOf = (uid: string): string => {
    const u = users.find(x => x.user_id === uid);
    return u?.email ?? `${uid.slice(0, 8)}…`;
  };

  return (
    <div className="flex flex-col gap-3">
      <TabState loading={loading && granted} error={error} onRetry={run} />
      {!granted && <Note>운영 DB 연결 또는 admins 등록 후 채워진다.</Note>}
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
            <tr><td colSpan={3} className="text-2xs text-text-dim">편지가 없다.</td></tr>
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
