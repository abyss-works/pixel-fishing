import { useState } from 'react';
import type { FormEvent } from 'react';
import { FRIEND_ERROR_TEXT, friendStatusText } from '../../../../features/friends/model/friends';
import type { FriendItem } from '../../../../features/friends/model/friends';
import { useFriends } from '../../../../features/friends/service/useFriends';
import { useNicknameSuggestions } from '../../../../features/friends/service/useNicknameSuggestions';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import Button from '../../../ui/Button';
import ConfirmDialog from '../../../ui/ConfirmDialog';
import { cx } from '../../../ui/cx';
import type { Notify } from '../../../ui/hud/messageFeed';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import Panel from '../../../ui/Panel';
import SelectList from '../../../ui/SelectList';
import SubTabs from '../../../ui/SubTabs';
import BlockList from './BlockList';
import TextInput from '../../../ui/TextInput';

// 소셜 창 — 게임 스테이지 안에 뜬다. 친구·차단 두 탭이다.
// 친구 탭의 왼쪽은 닉네임으로 요청하기와 받은·보낸 요청, 오른쪽은 친구 목록이다. 차단 탭은 차단한 사람과 해제다.
// 친구에게는 접속 중인지와 있는 곳, 아니면 마지막 행동이 얼마나 지났는지 보인다.
// 닉네임을 치는 동안 앞부분이 같은 계정 유저를 후보로 보이고, 후보를 고르면 입력을 그 이름으로 채운다.
const nameOf = (f: FriendItem) => f.nick ?? '이름 없음';

export default function FriendsModal({ setToast, onClose }: { setToast: Notify; onClose: () => void }) {
  const { groups, loading, failed, act } = useFriends(true);
  const nowMs = Date.parse(useNow());
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<FriendItem | null>(null);
  const [tab, setTab] = useState<'friends' | 'blocks'>('friends');
  const suggestions = useNicknameSuggestions(nickname)
    .filter(p => p.nickname.toLowerCase() !== nickname.trim().toLowerCase());

  const run = async (op: Parameters<typeof act>[0], done: (result: string) => void) => {
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
    <Modal layer="stage" xl onClose={onClose}>
      <ModalCard title="소셜" onClose={onClose}>
        <SubTabs items={[
          { key: 'friends', label: '친구', sub: groups && groups.incoming.length > 0 ? `받은 요청 ${groups.incoming.length}` : undefined },
          { key: 'blocks', label: '차단' },
        ]} activeKey={tab} onSelect={setTab} />
        {tab === 'blocks' ? <BlockList setToast={setToast} /> : (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 max-[640px]:grid-cols-1">
          <Panel title="친구 요청" className="min-w-0">
            <div className="pf-scroll-panel h-80 overflow-y-auto pr-1 flex flex-col gap-3 max-[640px]:h-auto">
              <form className="flex flex-col gap-1.5" onSubmit={e => { void onRequest(e); }}>
                <span className="text-xs text-text-dim">닉네임으로 찾아 요청해요. 상대가 수락하면 친구가 돼요.</span>
                <div className="flex gap-2">
                  <TextInput compact className="flex-1 min-w-0" value={nickname} maxLength={32}
                         onChange={e => setNickname(e.target.value)} aria-label="친구 닉네임" placeholder="닉네임" />
                  <Button type="submit" size="sm" variant="primary">요청</Button>
                </div>
                {suggestions.length > 0 && (
                  <SelectList label="닉네임 후보" items={suggestions} keyOf={p => p.uid} selectedKey=""
                              onSelect={key => { setNickname(suggestions.find(p => p.uid === key)?.nickname ?? nickname); setError(null); }}
                              renderItem={p => <span className="text-sm">{p.nickname}</span>} />
                )}
                {error && <Note tone="warn">{error}</Note>}
              </form>
              {groups && groups.incoming.length > 0 && (
                <section className="flex flex-col gap-1.5" aria-label="받은 요청">
                  <b className="text-xs">받은 요청</b>
                  {groups.incoming.map(f => (
                    <div key={f.uid} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 min-w-0 truncate">{nameOf(f)}</span>
                      <Button size="sm" variant="primary" disabled={busy}
                              onClick={() => { void run({ op: 'accept', uid: f.uid }, () => setToast(`${nameOf(f)} 님과 친구가 됐어요.`)); }}>수락</Button>
                      <Button size="sm" disabled={busy} onClick={() => { void run({ op: 'remove', uid: f.uid }, () => {}); }}>거절</Button>
                    </div>
                  ))}
                </section>
              )}
              {groups && groups.outgoing.length > 0 && (
                <section className="flex flex-col gap-1.5" aria-label="보낸 요청">
                  <b className="text-xs">보낸 요청</b>
                  {groups.outgoing.map(f => (
                    <div key={f.uid} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 min-w-0 truncate text-text-dim">{nameOf(f)}</span>
                      <Button size="sm" disabled={busy} onClick={() => { void run({ op: 'remove', uid: f.uid }, () => {}); }}>취소</Button>
                    </div>
                  ))}
                </section>
              )}
            </div>
          </Panel>
          <Panel title={groups ? `친구 ${groups.friends.length}명` : '친구'} className="min-w-0">
            <div className="pf-scroll-panel h-80 overflow-y-auto pr-1 max-[640px]:h-48">
              {groups && groups.friends.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {groups.friends.map(f => (
                    <li key={f.uid} className="flex items-center gap-2 text-sm">
                      <span className={cx('size-2 shrink-0', f.online ? 'bg-accent' : 'bg-line')} aria-hidden="true" />
                      <span className="flex-1 min-w-0">
                        <b className="block truncate">{nameOf(f)}</b>
                        <span className={cx('block text-xs', f.online ? 'text-accent' : 'text-text-dim')}>{friendStatusText(f, nowMs)}</span>
                      </span>
                      <Button size="sm" disabled={busy} onClick={() => setRemoving(f)}>끊기</Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex h-full items-center justify-center">
                  {loading ? <Note>친구 목록을 불러오는 중이에요.</Note>
                    : failed ? <Note tone="warn">친구 목록을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</Note>
                    : <Note>아직 친구가 없어요. 왼쪽에서 닉네임으로 요청해 보세요.</Note>}
                </div>
              )}
            </div>
          </Panel>
        </div>
        )}
      </ModalCard>
      {removing && (
        <ConfirmDialog layer="stage" title="친구 끊기" confirmLabel="끊기"
                       onCancel={() => setRemoving(null)}
                       onConfirm={() => {
                         const target = removing;
                         setRemoving(null);
                         void run({ op: 'remove', uid: target.uid }, () => setToast(`${nameOf(target)} 님과 친구를 끊었어요.`));
                       }}>
          <p className="text-sm">{nameOf(removing)} 님과 친구를 끊을까요? 다시 친구가 되려면 요청을 새로 보내야 해요.</p>
        </ConfirmDialog>
      )}
    </Modal>
  );
}
