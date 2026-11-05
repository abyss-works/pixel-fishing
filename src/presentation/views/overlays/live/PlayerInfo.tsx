import { useState } from 'react';
import { boatNameOf } from '../../../../game/content/boats';
import { FRIEND_ERROR_TEXT, friendRelation } from '../../../../features/friends/model/friends';
import { useFriends } from '../../../../features/friends/service/useFriends';
import { useChatModeration } from '../../../../features/live/service/useChatModeration';
import type { ChatActionError } from '../../../../features/live/service/useChatModeration';
import { usePlayerProfile } from '../../../../features/live/service/usePlayerProfile';
import Button from '../../../ui/Button';
import Frame from '../../../ui/Frame';
import type { Notify } from '../../../ui/hud/messageFeed';
import KeyValueRow from '../../../ui/KeyValueRow';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';

// 플레이어 정보 — 다른 플레이어의 닉네임·배·명성·도감 수와 친구 요청·차단·신고.
// 접속 목록과 채팅 이름에서 연다. 내 정보는 동작 없이 보인다. 동작은 계정 유저만 쓴다.
// 채팅 글줄에서 열었을 때만 그 글줄을 신고할 수 있다.

export interface PlayerTarget {
  uid: string;
  /** 접속 목록이나 채팅 줄에 보인 이름 — 프로필을 읽기 전 제목에 쓴다 */
  nick: string;
  /** 채팅 글줄에서 열었으면 그 글줄 번호 */
  chatId?: number;
}

const BLOCK_ERROR_TEXT: Record<ChatActionError, string> = {
  guest: '계정을 만든 뒤 쓸 수 있어요.',
  missing: '대상을 찾을 수 없어요. 오래된 메시지는 신고할 수 없어요.',
  failed: '요청을 처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.',
};

export function PlayerInfo({ target, self, account, setToast }: {
  target: PlayerTarget;
  /** 내 정보인가 — 동작을 보이지 않는다 */
  self: boolean;
  /** 내 계정 이메일. 게스트면 null */
  account: string | null;
  setToast: Notify;
}) {
  const { profile, loading, failed } = usePlayerProfile(target.uid);
  const member = account !== null && !self;
  const friends = useFriends(member);
  const moderation = useChatModeration(member);
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(false);

  if (loading) return <Note>정보를 불러오는 중이에요.</Note>;
  if (failed || !profile) return <Note tone="warn">정보를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</Note>;

  const name = profile.nickname ?? target.nick;
  const relation = friends.groups ? friendRelation(friends.groups, target.uid) : null;
  const blocked = moderation.isBlocked(target.uid);
  const chatId = target.chatId;

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true);
    try {
      const warn = await work();
      if (warn) setToast(warn, 'warn');
    } catch {
      setToast('요청을 보내지 못했어요. 연결을 확인해 주세요.', 'warn');
    } finally {
      setBusy(false);
    }
  };
  const befriend = (op: 'request' | 'accept') => run(async () => {
    const r = await friends.act(op === 'request' ? { op, nickname: name } : { op, uid: target.uid });
    if (!r.ok) return FRIEND_ERROR_TEXT[r.error] ?? '요청을 처리하지 못했어요. 잠시 뒤 다시 해 주세요.';
    setToast(r.result === 'requested' ? `${name} 님에게 친구 요청을 보냈어요.`
      : r.result === 'already' ? `${name} 님과는 이미 친구이거나 요청 중이에요.` : `${name} 님과 친구가 됐어요.`);
    return null;
  });
  const block = (op: 'block' | 'unblock') => run(async () => {
    const error = await (op === 'block' ? moderation.block(target.uid) : moderation.unblock(target.uid));
    if (error) return BLOCK_ERROR_TEXT[error];
    setToast(op === 'block' ? `${name} 님을 차단했어요. 이 사람의 채팅이 보이지 않아요.` : `${name} 님의 차단을 풀었어요.`);
    return null;
  });
  const report = (chatId: number) => run(async () => {
    const error = await moderation.report(chatId);
    if (error) return BLOCK_ERROR_TEXT[error];
    setReported(true);
    setToast('신고했어요. 운영자가 확인할게요.');
    return null;
  });

  return (
    <div className="flex flex-col gap-2">
      <Frame divided className="flex flex-col">
        <KeyValueRow label="닉네임" value={name} />
        <KeyValueRow label="배" value={profile.boat < 1 ? '없음' : `${boatNameOf(profile.boat)} · ${profile.boat}단계`} />
        <KeyValueRow label="명성" value={profile.fame.toLocaleString('ko-KR')} />
        <KeyValueRow label="도감" value={`${profile.dex}종`} />
      </Frame>
      {!self && account === null && <Note size="xs">친구 요청·차단·신고는 계정을 만든 뒤 쓸 수 있어요.</Note>}
      {member && (
        <div className="flex flex-wrap items-center gap-2">
          {profile.account && !friends.offline && blocked === false && (
            relation === 'friend' ? <span className="text-xs text-accent">친구예요</span>
            : relation === 'outgoing' ? <span className="text-xs text-text-dim">친구 요청을 보냈어요</span>
            : relation === 'incoming' ? <Button size="sm" variant="primary" disabled={busy} onClick={() => void befriend('accept')}>친구 수락</Button>
            : friends.groups && <Button size="sm" variant="primary" disabled={busy} onClick={() => void befriend('request')}>친구 요청</Button>
          )}
          {blocked !== null && (
            <Button size="sm" disabled={busy} onClick={() => void block(blocked ? 'unblock' : 'block')}>
              {blocked ? '차단 해제' : '차단'}
            </Button>
          )}
          {chatId !== undefined && (
            <Button size="sm" disabled={busy || reported} onClick={() => void report(chatId)}>
              {reported ? '신고함' : '이 채팅 신고'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** 채팅 이름에서 여는 플레이어 정보 창 */
export default function PlayerModal({ onClose, ...props }: Parameters<typeof PlayerInfo>[0] & { onClose: () => void }) {
  return (
    <Modal layer="stage" onClose={onClose}>
      <ModalCard title={props.self ? '내 정보' : '플레이어 정보'} onClose={onClose}>
        <PlayerInfo {...props} />
      </ModalCard>
    </Modal>
  );
}
