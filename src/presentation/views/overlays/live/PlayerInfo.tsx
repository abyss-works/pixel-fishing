import { useState } from 'react';
import { FRIEND_ERROR_TEXT, friendRelation } from '../../../../features/friends/model/friends';
import { useFriends } from '../../../../features/friends/service/useFriends';
import { useChatModeration } from '../../../../features/live/service/useChatModeration';
import type { ChatActionError } from '../../../../features/live/service/useChatModeration';
import { usePlayerProfile } from '../../../../features/live/service/usePlayerProfile';
import { useOnline } from '../../../../features/live/service/useLive';
import { selectProfileView } from '../../../../features/live/model/profile';
import type { ProfileView } from '../../../../features/live/model/profile';
import Badge from '../../../ui/Badge';
import BoatSprite from '../../../ui/BoatSprite';
import Button from '../../../ui/Button';
import Frame from '../../../ui/Frame';
import type { Notify } from '../../../ui/hud/messageFeed';
import Inset from '../../../ui/Inset';
import KpiTile from '../../../ui/KpiTile';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import { cx } from '../../../ui/cx';
import { fmtNum } from '../../../ui/format';

// 플레이어 정보 — 스탯창 요약처럼 머리 카드(배·닉네임·꼬리표), 명성·도감 타일, 해역별 도감, 배·낚싯대, 유물 칸을 보이고
// 맨 아래 오른쪽에 친구 요청·차단·신고를 둔다.
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
  const online = useOnline(target.uid);
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
      <ProfileBody name={name} online={online && !self} view={selectProfileView(profile)} />
      {!self && account === null && <Note size="xs">친구 요청·차단·신고는 계정을 만든 뒤 쓸 수 있어요.</Note>}
      {member && (
        <div className="flex flex-wrap items-center justify-end gap-2">
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

// 등급색 — 가진 유물 칸의 테두리와 이름
const GRADE_CLASS: Record<NonNullable<ProfileView['artifacts']['slots'][number]['grade']>, string> = {
  common: 'border-common text-common',
  rare: 'border-rare text-rare',
  epic: 'border-epic text-epic',
  legendary: 'border-legend text-legend',
};

function ProfileBody({ name, online, view }: { name: string; online: boolean; view: ProfileView }) {
  const { dex, boat, rod, artifacts } = view;
  return (
    <>
      <Frame className="bg-surface-2 flex items-center gap-3 px-3 py-2">
        {boat.tier > 0 && <BoatSprite tier={boat.tier} preset="row" />}
        <div className="min-w-0 flex flex-col gap-1">
          <span className="text-base font-bold truncate">{name}</span>
          <span className="flex flex-wrap gap-1">
            <Badge>{boat.name}</Badge><Badge>낚싯대 Lv.{rod.level}</Badge>
            {online && <span className="text-xs px-1.5 py-0.5 rounded-sm border border-accent text-accent">접속 중</span>}
          </span>
        </div>
      </Frame>
      <div className="grid grid-cols-2 gap-2">
        <KpiTile label="명성" value={fmtNum(view.fame)} />
        <KpiTile label="도감" value={`${dex.found} / ${dex.total}`} hint="일반 폼으로 한 번이라도 낚은 어종" />
      </div>
      <Inset className="px-3 py-2 flex flex-col gap-1.5" >
        {dex.zones.map(z => (
          <div key={z.zone} className="grid grid-cols-[6rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs"
               aria-label={`${z.name} 도감 ${z.found}/${z.total}`}>
            <span className="truncate">{z.name}</span>
            <span className="h-2 border border-line bg-surface-2">
              <span className={cx('block h-full', z.complete ? 'bg-gold' : 'bg-accent')}
                    style={{ width: `${z.total ? (z.found / z.total) * 100 : 0}%` }} />
            </span>
            <span className="text-right text-text-dim"><b className="text-text">{z.found}</b> / {z.total}</span>
          </div>
        ))}
      </Inset>
      <div className="grid grid-cols-2 gap-2">
        <Inset className="px-3 py-2 flex flex-col gap-1">
          <span className="text-xs text-text-dim">배</span>
          <b className="text-sm truncate">{boat.tier > 0 ? `${boat.name} · ${boat.tier}단계` : '없음'}</b>
          <span className="flex gap-0.5" aria-label={`배 ${boat.tier}/${boat.max}단계`}>
            {Array.from({ length: boat.max }, (_, i) => (
              <span key={i} className={cx('h-1.5 flex-1 border border-line', i < boat.tier && 'bg-accent')} />
            ))}
          </span>
        </Inset>
        <Inset className="px-3 py-2 flex flex-col gap-1">
          <span className="text-xs text-text-dim">낚싯대</span>
          <b className="text-sm">Lv.{rod.level}</b>
          <span className="text-xs text-text-dim">파워 {rod.power}</span>
        </Inset>
      </div>
      <div className="flex justify-between text-xs text-text-dim">
        <span>유물</span><span>{artifacts.owned} / {artifacts.slots.length}</span>
      </div>
      <ul className="grid grid-cols-4 gap-1.5">
        {artifacts.slots.map(s => (
          <li key={s.id}
              className={cx('min-h-12 border-2 px-1 py-1.5 flex items-center justify-center text-center text-2xs leading-tight',
                s.grade ? cx('bg-bg', GRADE_CLASS[s.grade]) : 'border-dashed border-line text-text-dim')}
              aria-label={s.name ? `유물 ${s.name}` : `${s.zone} 유물 없음`}>
            {s.name ?? s.zone}
          </li>
        ))}
      </ul>
    </>
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
