// 편지 구역 — 유저가 보낸 편지(letters, 영구) 목록. admin과 maintainer 모두 열람·답장할 수 있으며 이메일은 canViewEmail에 따른다.
import { useMemo, useState } from 'react';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import DataTable from '../../../ui/DataTable';
import Modal from '../../../ui/Modal';
import Note from '../../../ui/Note';
import { cx } from '../../../ui/cx';
import { fmtDT } from '../../../../features/admin/model/metrics';
import { adminIdentityLookup, adminUserLabel } from '../../../../features/admin/model/adminViews';
import { repliesForUser } from '../../../../features/admin/model/sentMailView';
import { readAdminLetters, readAdminMails, readAdminUsers } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminLetterHandled } from '../../../../features/admin/service/useAdminMail';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import type { AdminLetterRow, AdminSentMailRow, AdminUserRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { AdminCard, AdminTableWrap, TabState } from '../layout';
import SentMailCard from '../SentMailCard';
import UserIdentity from '../UserIdentity';

const NO_LETTERS: AdminLetterRow[] = [];
const NO_MAILS: AdminSentMailRow[] = [];
const NO_USERS: AdminUserRow[] = [];

export default function LettersTab({ onCompose }: {
  /** 이 계정을 받는 사람으로 넣고 우편 쓰기를 연다 */
  onCompose: (userId: string) => void;
}) {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const lettersQuery = useAdminQuery(adminKeys.letters, readAdminLetters, granted);
  const usersQuery = useAdminQuery(adminKeys.users, readAdminUsers, granted);
  const mailsQuery = useAdminQuery(adminKeys.mails, readAdminMails, granted);
  const markHandled = useAdminLetterHandled();
  const [busy, setBusy] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  const letters = lettersQuery.data ?? NO_LETTERS;
  const users = usersQuery.data ?? NO_USERS;
  const mails = mailsQuery.data ?? NO_MAILS;
  const loading = lettersQuery.loading || usersQuery.loading || mailsQuery.loading;
  const error = lettersQuery.error ?? usersQuery.error ?? mailsQuery.error;
  const refresh = () => {
    lettersQuery.refresh();
    usersQuery.refresh();
    mailsQuery.refresh();
  };

  const identityOf = adminIdentityLookup(users);
  const repliesByUser = useMemo(() => {
    const map = new Map<string, AdminSentMailRow[]>();
    for (const letter of letters) {
      const key = letter.user_id.toLowerCase();
      if (!map.has(key)) {
        map.set(key, repliesForUser(mails, letter.user_id));
      }
    }
    return map;
  }, [letters, mails]);

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
  const viewingReplies = viewingUserId ? repliesForUser(mails, viewingUserId) : NO_MAILS;
  const viewingIdentity = viewingUserId ? identityOf(viewingUserId) : null;

  return (
    <>
      <TabState loading={loading && granted} error={error} onRetry={refresh} />
      {!granted && <Note className="my-0">운영 DB에 연결하거나 admins에 등록하면 채워져요.</Note>}
      {failure && <Note tone="warn" className="my-0">{failure}</Note>}

      <AdminCard
        title={`편지 (${letters.length}, 처리 전 ${open})`}
        badge={open > 0 ? <Badge tone="gold" size="xs">{`미처리 ${open}건`}</Badge> : undefined}
      >
        <AdminTableWrap scroll>
          <DataTable className="pf-admin-table">
            <thead>
              <tr>
                <th className="text-left">시각</th>
                <th className="text-left">보낸 사람</th>
                <th className="text-left">내용</th>
                <th className="text-left">조치</th>
              </tr>
            </thead>
            <tbody>
              {letters.map(l => {
                const replies = repliesByUser.get(l.user_id.toLowerCase()) ?? NO_MAILS;
                return (
                  <tr key={l.id} className={cx(l.handled_at && 'text-text-dim')}>
                    <td className="text-2xs text-text-dim whitespace-nowrap align-top">{fmtDT(l.created_at)}</td>
                    <td className="align-top"><UserIdentity user={identityOf(l.user_id)} /></td>
                    <td className="text-xs whitespace-pre-wrap select-text">{l.text}</td>
                    <td className="align-top">
                      <div className="flex flex-col items-start gap-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <Button size="sm" onClick={() => onCompose(l.user_id)}>우편으로 답장</Button>
                          {replies.length > 0 && (
                            <Button size="sm" variant="ghost" onClick={() => setViewingUserId(l.user_id)}>
                              {`답장 ${replies.length}건`}
                            </Button>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === l.id}
                          onClick={() => void toggle(l.id, !l.handled_at)}
                        >
                          {l.handled_at ? '처리 취소' : '처리 완료'}
                        </Button>
                        {l.handled_at && <span className="text-2xs text-text-dim">{`${fmtDT(l.handled_at)} 처리`}</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {letters.length === 0 && (
                <tr><td colSpan={4} className="text-text-dim text-center py-3">편지가 없어요.</td></tr>
              )}
            </tbody>
          </DataTable>
        </AdminTableWrap>
      </AdminCard>

      {viewingUserId && viewingIdentity && (
        <Modal
          layer="app"
          wide
          title={`보낸 답장 우편 (${viewingReplies.length}건): ${adminUserLabel(viewingIdentity)}`}
          onClose={() => setViewingUserId(null)}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <UserIdentity user={viewingIdentity} inline />
              <Button
                size="sm"
                onClick={() => {
                  const uid = viewingUserId;
                  setViewingUserId(null);
                  onCompose(uid);
                }}
              >
                새 우편 쓰기
              </Button>
            </div>
            {viewingReplies.length > 0 ? (
              viewingReplies.map(reply => (
                <SentMailCard key={reply.id} mail={reply} />
              ))
            ) : (
              <Note className="my-0">보낸 답장 우편이 없어요.</Note>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
