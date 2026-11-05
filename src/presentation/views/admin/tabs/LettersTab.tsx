// 편지 구역 — 유저가 보낸 편지(letters, 영구) 목록. events 7일 창 밖의 오래된 편지도 보인다.
// 보낸 사람은 명부의 계정 식별 표기로 보이고, 우편으로 답장하거나 처리 표시를 남길 수 있다.
import { useState } from 'react';
import Button from '../../../ui/Button';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { cx } from '../../../ui/cx';
import { fmtDT } from '../../../../features/admin/model/metrics';
import { adminIdentityLookup } from '../../../../features/admin/model/adminViews';
import { readAdminLetters } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminLetterHandled } from '../../../../features/admin/service/useAdminMail';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Cell, TabState } from '../layout';
import UserIdentity from '../UserIdentity';

// 조회 전 골격 — 게이트는 내용을 교체하지 않으므로 빈 표를 그린다
const EMPTY: Awaited<ReturnType<typeof readAdminLetters>> = [[], []];

export default function LettersTab({ onCompose }: {
  /** 이 계정을 받는 사람으로 넣고 우편 쓰기를 연다 */
  onCompose: (userId: string) => void;
}) {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.letters, readAdminLetters, granted);
  const markHandled = useAdminLetterHandled();
  const [busy, setBusy] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const [letters, users] = data ?? EMPTY;

  const identityOf = adminIdentityLookup(users);

  const toggle = async (id: number, handled: boolean) => {
    setBusy(id);
    setFailure(null);
    try {
      await markHandled(id, handled);
    } catch (e) {
      setFailure(String((e as { message?: unknown }).message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const open = letters.filter(l => !l.handled_at).length;

  return (
    <>
      <TabState loading={loading && granted} error={error} onRetry={refresh} />
      {!granted && <Note className="my-0">운영 DB에 연결하거나 admins에 등록하면 채워져요.</Note>}
      {failure && <Note tone="warn" className="my-0">{failure}</Note>}
      <Cell title={`편지 (${letters.length}, 처리 전 ${open})`} flush>
        <div className="pf-scroll-panel max-h-[560px] overflow-auto px-1">
          <DataTable>
            <thead>
              <tr>
                <th className="text-left">시각</th>
                <th className="text-left">보낸 사람</th>
                <th className="text-left">내용</th>
                <th className="text-left">조치</th>
              </tr>
            </thead>
            <tbody>
              {letters.map(l => (
                <tr key={l.id} className={cx(l.handled_at && 'text-text-dim')}>
                  <td className="text-2xs text-text-dim whitespace-nowrap align-top">{fmtDT(l.created_at)}</td>
                  <td className="align-top"><UserIdentity user={identityOf(l.user_id)} /></td>
                  <td className="text-xs whitespace-pre-wrap select-text">{l.text}</td>
                  <td className="align-top">
                    <div className="flex flex-col items-start gap-1">
                      <Button size="sm" onClick={() => onCompose(l.user_id)}>우편으로 답장</Button>
                      <Button size="sm" variant="ghost" disabled={busy === l.id}
                              onClick={() => void toggle(l.id, !l.handled_at)}>
                        {l.handled_at ? '처리 취소' : '처리 완료'}
                      </Button>
                      {l.handled_at && <span className="text-2xs text-text-dim">{`${fmtDT(l.handled_at)} 처리`}</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {letters.length === 0 && (
                <tr><td colSpan={4} className="text-text-dim text-center py-3">편지가 없어요.</td></tr>
              )}
            </tbody>
          </DataTable>
        </div>
      </Cell>
    </>
  );
}
