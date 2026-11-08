import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { FRIEND_ERROR_TEXT, friendPlaceText } from '../../../../features/friends/model/friends';
import type { FriendGroups, FriendItem } from '../../../../features/friends/model/friends';
import { useFriends } from '../../../../features/friends/service/useFriends';
import { useNicknameSuggestions } from '../../../../features/friends/service/useNicknameSuggestions';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import Button from '../../../ui/Button';
import ConfirmDialog from '../../../ui/ConfirmDialog';
import { cx } from '../../../ui/cx';
import type { Notify } from '../../../ui/hud/messageFeed';
import TableBox from '../../../ui/TableBox';
import DataTable from '../../../ui/DataTable';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import SelectList from '../../../ui/SelectList';
import TabBar from '../../../ui/TabBar';
import TextInput from '../../../ui/TextInput';
import Tip from '../../../ui/Tip';
import BlockList from './BlockList';
import { SOCIAL_CELL, SOCIAL_HEAD } from './socialTable';
import { SCROLL_Y } from '../../../ui/scrollArea';

// 소셜 창. 게임 스테이지 안에 뜨고, 680 폭에 높이를 고정한다. 탭은 친구, 요청, 차단 셋이고 한 탭이 한 가지 일만 한다.
// 친구 탭은 친구 표(접속 점, 이름, 있는 곳, 끊기)다. 접속 중인 친구가 먼저 오고, 있는 곳 칸은 접속 중이면 지금 있는 곳,
// 아니면 마지막 행동에서 지난 시간이다. 요청 탭은 닉네임 입력과 받은 요청, 보낸 요청 표이고, 받은 요청 수는 탭 이름 옆 숫자로 보인다.
// 닉네임을 치는 동안 앞부분이 같은 계정 유저를 입력 아래에 후보로 띄우고, 후보를 고르면 입력을 그 이름으로 채운다.
// 창 전체에 공통인 상태가 없어 고정 정보 줄은 두지 않는다. 창 자체는 스크롤하지 않고, 넘치는 내용은 탭 본문 안에서 굴린다.
const nameOf = (f: FriendItem) => f.nick ?? '이름 없음';
const PLACE_HELP = '접속 중이면 지금 있는 해역이에요.\n접속하지 않았으면 마지막 접속에서 지난 시간이에요.';

type SocialTab = 'friends' | 'requests' | 'blocks';
type FriendOp = Parameters<ReturnType<typeof useFriends>['act']>[0];

export default function FriendsModal({ setToast, onClose }: { setToast: Notify; onClose: () => void }) {
  const { groups, loading, failed, act } = useFriends(true);
  const [tab, setTab] = useState<SocialTab>('friends');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<FriendItem | null>(null);

  const run = async (op: FriendOp, done: (result: string) => void) => {
    setBusy(true);
    try {
      const r = await act(op);
      if (r.ok) done(r.result);
      else setToast(FRIEND_ERROR_TEXT[r.error] ?? '요청을 처리하지 못했어요. 잠시 뒤 다시 해 주세요.', 'warn');
      return r.ok;
    } catch {
      setToast('친구 요청을 보내지 못했어요. 연결을 확인해 주세요.', 'warn');
      return false;
    } finally {
      setBusy(false);
    }
  };
  /** 목록을 아직 못 받았을 때 표 자리에 띄우는 안내 */
  const pending = loading ? <Note>친구 목록을 불러오는 중이에요.</Note>
    : failed ? <Note tone="warn">친구 목록을 불러오지 못했어요.<br />잠시 뒤 다시 열어 주세요.</Note> : null;

  return (
    // 탭이 있는 창의 높이: 요청 탭(입력과 세 줄 높이 표 둘)이 들어가는 480px. 스테이지가 낮으면 위아래 16px을 남긴다
    <Modal layer="stage" md height={480} onClose={onClose}>
      <ModalCard title="소셜" onClose={onClose} fixed>
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <TabBar<SocialTab> activeKey={tab} onSelect={setTab} tabs={[
            { key: 'friends', label: groups ? `친구 ${groups.friends.length}` : '친구' },
            { key: 'requests', label: '요청', count: groups?.incoming.length },
            { key: 'blocks', label: '차단' },
          ]} />
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            {tab === 'friends' && (
              <FriendTable friends={groups?.friends ?? null} pending={pending} busy={busy} onRemove={setRemoving} />
            )}
            {tab === 'requests' && (
              <FriendRequests groups={groups} pending={pending} busy={busy} act={act} run={run} setToast={setToast} />
            )}
            {tab === 'blocks' && <BlockList setToast={setToast} />}
          </div>
        </div>
      </ModalCard>
      {removing && (
        <ConfirmDialog layer="stage" title="친구 끊기" confirmLabel="끊기"
                       onCancel={() => setRemoving(null)}
                       onConfirm={() => {
                         const target = removing;
                         setRemoving(null);
                         void run({ op: 'remove', uid: target.uid }, () => setToast(`${nameOf(target)} 님과 친구를 끊었어요.`));
                       }}>
          <p className="text-sm">{nameOf(removing)} 님과 친구를 끊을까요?<br />다시 친구가 되려면 요청을 새로 보내야 해요.</p>
        </ConfirmDialog>
      )}
    </Modal>
  );
}

/** 친구 탭: 접속 점, 이름, 있는 곳, 끊기. 접속하지 않은 친구는 이름과 있는 곳을 흐리게 쓴다 */
function FriendTable({ friends, pending, busy, onRemove }: {
  friends: FriendItem[] | null; pending: ReactNode; busy: boolean; onRemove: (f: FriendItem) => void;
}) {
  const nowMs = Date.parse(useNow());
  return (
    <TableBox className="flex-1 min-h-0 px-3 pb-2">
      {friends && friends.length > 0 ? (
        <DataTable cols={[null, '150px', '4rem']} nameMin="8rem">
          <thead>
            <tr className={SOCIAL_HEAD.row}>
              <th className={SOCIAL_HEAD.left}>이름</th>
              <th className={SOCIAL_HEAD.right}><Tip text={PLACE_HELP}>있는 곳</Tip></th>
              <th className={SOCIAL_HEAD.right} aria-label="끊기" />
            </tr>
          </thead>
          <tbody>
            {friends.map((f, i) => (
              <tr key={f.uid}>
                <td className={SOCIAL_CELL(i)}>
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={cx('size-2 shrink-0', f.online ? 'bg-accent' : 'bg-line')}
                          role="img" aria-label={f.online ? '접속 중' : '접속 안 함'} />
                    <b className={cx('truncate', f.online ? 'text-text' : 'font-normal text-text-dim')}>{nameOf(f)}</b>
                  </span>
                </td>
                <td className={cx(SOCIAL_CELL(i), 'px-2 text-right text-xs truncate', f.online ? 'text-accent' : 'text-text-dim')}>
                  {friendPlaceText(f, nowMs)}
                </td>
                <td className={cx(SOCIAL_CELL(i), 'text-right')}>
                  <Button size="sm" disabled={busy} onClick={() => onRemove(f)}>끊기</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      ) : (
        <div className="flex h-full items-center justify-center text-center">
          {pending ?? <Note>아직 친구가 없어요.<br />요청 탭에서 닉네임으로 요청해 보세요.</Note>}
        </div>
      )}
    </TableBox>
  );
}

/** 요청 탭: 위에 닉네임 입력, 아래에 받은 요청과 보낸 요청 표(각 세 줄 높이, 넘치면 표 안에서 굴린다) */
function FriendRequests({ groups, pending, busy, act, run, setToast }: {
  groups: FriendGroups | null;
  pending: ReactNode;
  busy: boolean;
  act: ReturnType<typeof useFriends>['act'];
  run: (op: FriendOp, done: (result: string) => void) => Promise<boolean>;
  setToast: Notify;
}) {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const suggestions = useNicknameSuggestions(nickname)
    .filter(p => p.nickname.toLowerCase() !== nickname.trim().toLowerCase());

  const onRequest = async (e: FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    if (!name) { setError(FRIEND_ERROR_TEXT['bad-nickname']); return; }
    setError(null);
    const r = await act({ op: 'request', nickname: name }).catch(() => null);
    if (!r) { setError('요청을 보내지 못했어요. 연결을 확인해 주세요.'); return; }
    if (!r.ok) { setError(FRIEND_ERROR_TEXT[r.error] ?? '요청을 보내지 못했어요.'); return; }
    setNickname('');
    setToast(r.result === 'accepted' ? `${name} 님과 친구가 됐어요.`
      : r.result === 'already' ? `${name} 님과는 이미 친구이거나 요청 중이에요.` : `${name} 님에게 친구 요청을 보냈어요.`);
  };

  return (
    <div className={`flex flex-col gap-3 flex-1 min-h-0 ${SCROLL_Y}`}>
      {/* 후보와 오류는 입력 아래에 떠서 아래 표를 밀지 않는다 */}
      <form className="relative flex gap-2 shrink-0" onSubmit={e => { void onRequest(e); }}>
        <TextInput className="flex-1 min-w-0" value={nickname} maxLength={32}
                   onChange={e => { setNickname(e.target.value); setError(null); }} aria-label="친구 닉네임" placeholder="닉네임" />
        <Button type="submit" variant="primary">요청</Button>
        {(suggestions.length > 0 || error) && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 bg-surface">
            {suggestions.length > 0 ? (
              <SelectList label="닉네임 후보" items={suggestions} keyOf={p => p.uid} selectedKey=""
                          onSelect={key => { setNickname(suggestions.find(p => p.uid === key)?.nickname ?? nickname); setError(null); }}
                          renderItem={p => <span className="text-sm">{p.nickname}</span>} />
            ) : (
              <Note tone="warn" className="my-0 px-2 py-1">{error}</Note>
            )}
          </div>
        )}
      </form>
      <FriendRequestTable label="받은 요청" rows={groups?.incoming ?? null} pending={pending} empty="받은 요청이 없어요."
                          actions={f => (
                            <>
                              <Button size="sm" disabled={busy} onClick={() => { void run({ op: 'remove', uid: f.uid }, () => {}); }}>거절</Button>
                              <Button size="sm" variant="primary" disabled={busy}
                                      onClick={() => { void run({ op: 'accept', uid: f.uid }, () => setToast(`${nameOf(f)} 님과 친구가 됐어요.`)); }}>수락</Button>
                            </>
                          )} />
      <FriendRequestTable label="보낸 요청" rows={groups?.outgoing ?? null} pending={pending} empty="보낸 요청이 없어요."
                          actions={f => (
                            <Button size="sm" disabled={busy} onClick={() => { void run({ op: 'remove', uid: f.uid }, () => {}); }}>취소</Button>
                          )} />
    </div>
  );
}

/** 요청 표 하나: 이름표 줄(이름과 수), 표 머리 한 줄과 세 줄 높이의 칸 */
function FriendRequestTable({ label, rows, pending, empty, actions }: {
  label: string; rows: FriendItem[] | null; pending: ReactNode; empty: string; actions: (f: FriendItem) => ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5 min-h-0" aria-label={label}>
      <span className="flex justify-between text-xs text-text-dim">
        <span>{label}</span><span className="pf-accent">{rows?.length ?? 0}</span>
      </span>
      <TableBox className="h-[138px] min-h-16 shrink px-3 py-1">
        {rows && rows.length > 0 ? (
          <DataTable cols={[null, '132px']} nameMin="8rem">
            <tbody>
              {rows.map((f, i) => (
                <tr key={f.uid}>
                  <td className={cx(SOCIAL_CELL(i), 'truncate')}>{nameOf(f)}</td>
                  <td className={SOCIAL_CELL(i)}><span className="flex justify-end gap-1.5">{actions(f)}</span></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            {pending ?? <Note size="xs" className="my-0">{empty}</Note>}
          </div>
        )}
      </TableBox>
    </section>
  );
}
