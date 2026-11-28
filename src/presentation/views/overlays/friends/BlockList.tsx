import { useState } from 'react';
import { GUEST_LOCK_TEXT } from '../../../../features/display/model/menuLock';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import { useChatModeration } from '../../../../features/live/service/useChatModeration';
import type { ChatActionError } from '../../../../features/live/service/useChatModeration';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import type { Notify } from '../../../ui/hud/messageFeed';
import TableBox from '../../../ui/TableBox';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { SOCIAL_CELL, SOCIAL_HEAD } from './socialTable';

// 친구 창의 차단 탭: 내가 차단한 사람 표와 행 끝의 해제. 차단은 플레이어 정보 창에서 한다.
const ERROR_TEXT: Record<ChatActionError, string> = {
  guest: GUEST_LOCK_TEXT,
  missing: '대상을 찾을 수 없어요.',
  failed: '요청을 처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.',
};

export default function BlockList({ setToast }: { setToast: Notify }) {
  const { blocks, loading, failed, reload, unblock } = useChatModeration(true);
  const [busy, setBusy] = useState(false);
  const release = async (uid: string, name: string) => {
    setBusy(true);
    try {
      const error = await unblock(uid);
      if (error) sendNotice(setToast, { kind: 'system.modalRejected', text: ERROR_TEXT[error] });
      else sendNotice(setToast, { kind: 'social.modalAction', text: `${name} 님의 차단을 풀었어요.`, toastText: `${name} 님 차단 해제` });
    } finally {
      setBusy(false);
    }
  };
  return (
    <TableBox className="flex-1 min-h-0 px-3 pb-2">
      {Array.isArray(blocks) && blocks.length > 0 ? (
        <DataTable cols={[null, '4rem']} nameMin="8rem">
          <thead>
            <tr className={SOCIAL_HEAD.row}>
              <th className={SOCIAL_HEAD.left}>차단한 사람</th>
              <th className={SOCIAL_HEAD.right} aria-label="해제" />
            </tr>
          </thead>
          <tbody>
            {blocks.map((b, i) => (
              <tr key={b.uid}>
                <td className={cx(SOCIAL_CELL(i), 'truncate')}>{b.nick ?? '이름 없음'}</td>
                <td className={cx(SOCIAL_CELL(i), 'text-right')}>
                  <Button size="sm" disabled={busy} onClick={() => { void release(b.uid, b.nick ?? '이름 없음'); }}>해제</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      ) : (
        <div className="flex h-full items-center justify-center text-center">
          {loading ? <Note>차단 목록을 불러오는 중이에요.</Note>
            : failed ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <Note tone="warn" className="my-0">차단 목록을 열지 못했어요.</Note>
                <Button size="sm" onClick={reload}>다시 시도</Button>
              </div>
            )
            : typeof blocks === 'string' ? <Note tone="warn">{ERROR_TEXT[blocks]}</Note>
            : Array.isArray(blocks) ? <Note>차단한 사람이 없어요.<br />채팅 이름을 눌러 연 플레이어 정보에서 차단할 수 있어요.</Note>
            : (
              <div className="flex flex-col items-center gap-2 text-center">
                <Note tone="warn" className="my-0">차단 목록을 열지 못했어요.</Note>
                <Button size="sm" onClick={reload}>다시 시도</Button>
              </div>
            )}
        </div>
      )}
    </TableBox>
  );
}
