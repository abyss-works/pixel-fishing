import { useState } from 'react';
import type { ReactNode } from 'react';
import { GUEST_LOCK_TEXT, guestLock } from '../../../../features/display/model/menuLock';
import { isGuest } from '../../../../features/account/service/accountActions';
import { FRIEND_ERROR_TEXT, friendRelation } from '../../../../features/friends/model/friends';
import { useFriends } from '../../../../features/friends/service/useFriends';
import { useChatModeration } from '../../../../features/live/service/useChatModeration';
import type { ChatActionError } from '../../../../features/live/service/useChatModeration';
import { usePlayerProfile } from '../../../../features/live/service/usePlayerProfile';
import { useOnline } from '../../../../features/live/service/useLive';
import { selectProfileView } from '../../../../features/live/model/profile';
import type { ProfileView } from '../../../../features/live/model/profile';
import BoatSprite from '../../../ui/BoatSprite';
import Button from '../../../ui/Button';
import type { Notify } from '../../../ui/hud/messageFeed';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import Locked from '../../../ui/Locked';
import Tip from '../../../ui/Tip';
import { cx } from '../../../ui/cx';
import { fmtNum } from '../../../ui/format';

// 플레이어 정보. 칸 셋으로 보인다. 요약 칸(배 그림과 닉네임, 명성, 도감, 배, 낚싯대, 파워, 맨 아래 동작 버튼),
// 해역별 도감 칸, 유물 칸이다. 접속 목록(680 폭)에서는 요약 칸이 왼쪽 위아래를 쓰고 오른쪽에 도감과 유물이 위아래로 놓이며,
// 채팅 이름에서 여는 400 폭 창에서는 같은 칸을 위아래로 쌓는다.
// 동작(친구 요청, 차단, 채팅 글줄 신고)은 계정 유저만 쓴다. 게스트에게는 버튼을 흐리게 두고 이유를 툴팁으로 보인다. 내 정보에는 동작이 없다.
// 채팅 글줄에서 열었을 때만 그 글줄을 신고할 수 있다.

export interface PlayerTarget {
  uid: string;
  /** 접속 목록이나 채팅 줄에 보인 이름 — 프로필을 읽기 전 제목에 쓴다 */
  nick: string;
  /** 채팅 글줄에서 열었으면 그 글줄 번호 */
  chatId?: number;
}

const BLOCK_ERROR_TEXT: Record<ChatActionError, string> = {
  guest: GUEST_LOCK_TEXT,
  missing: '대상을 찾을 수 없어요. 오래된 메시지는 신고할 수 없어요.',
  failed: '요청을 처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.',
};
const DEX_HELP = '일반 폼으로 한 번이라도 낚은 어종';

export function PlayerInfo({ target, self, account, setToast, layout = 'stack' }: {
  target: PlayerTarget;
  /** 내 정보인가 — 동작을 보이지 않는다 */
  self: boolean;
  /** 내 계정 이메일. 게스트면 null */
  account: string | null;
  setToast: Notify;
  /** grid = 접속 목록의 세 칸 배치, stack = 400 폭 창의 위아래 쌓기 */
  layout?: 'grid' | 'stack';
}) {
  const { profile, loading, failed } = usePlayerProfile(target.uid);
  const online = useOnline(target.uid);
  const member = account !== null && !self;
  const friends = useFriends(member);
  const moderation = useChatModeration(member);
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(false);

  if (loading) return <Note>정보를 불러오는 중이에요.</Note>;
  if (failed || !profile) return <Note tone="warn">정보를 불러오지 못했어요.<br />잠시 뒤 다시 열어 주세요.</Note>;

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

  // 친구 동작 자리: 관계에 따라 요청, 수락 버튼이나 관계 문구 하나
  const friendSlot = profile.account && !friends.offline && blocked === false && (
    relation === 'friend' ? <span className="flex-1 text-xs text-accent">친구예요</span>
    : relation === 'outgoing' ? <span className="flex-1 text-xs text-text-dim">친구 요청을 보냈어요</span>
    : relation === 'incoming' ? <Button variant="primary" className="flex-1" disabled={busy} onClick={() => void befriend('accept')}>친구 수락</Button>
    : friends.groups && <Button variant="primary" className="flex-1" disabled={busy} onClick={() => void befriend('request')}>친구 요청</Button>
  );
  const lock = guestLock('player', isGuest(account));
  const actions = self ? null : lock ? (
    <div className="flex items-center gap-2">
      <Locked lines={lock} label="친구 요청" className="flex-1 block">
        <Button variant="primary" full disabled>친구 요청</Button>
      </Locked>
      <Locked lines={lock} label="차단">
        <Button disabled>차단</Button>
      </Locked>
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      {friendSlot}
      {blocked !== null && (
        <Button disabled={busy} onClick={() => void block(blocked ? 'unblock' : 'block')}>
          {blocked ? '차단 해제' : '차단'}
        </Button>
      )}
      {chatId !== undefined && (
        <Button disabled={busy || reported} onClick={() => void report(chatId)}>
          {reported ? '신고함' : '이 채팅 신고'}
        </Button>
      )}
    </div>
  );

  return (
    <ProfileCells name={name} online={layout === 'stack' && online && !self} view={selectProfileView(profile)}
                  layout={layout} actions={actions} />
  );
}

// 등급색 — 가진 유물 칸의 테두리와 이름
const GRADE_CLASS: Record<NonNullable<ProfileView['artifacts']['slots'][number]['grade']>, string> = {
  common: 'border-common text-common',
  rare: 'border-rare text-rare',
  epic: 'border-epic text-epic',
  legendary: 'border-legend text-legend',
};

/** 요약, 해역별 도감, 유물 세 칸. grid면 요약 칸이 왼쪽 두 줄을 잇는다 */
function ProfileCells({ name, online, view, layout, actions }: {
  name: string;
  /** 이름 앞에 접속 점을 붙인다(채팅에서 연 창). 접속 목록은 모두 접속 중이라 붙이지 않는다 */
  online: boolean;
  view: ProfileView;
  layout: 'grid' | 'stack';
  actions: ReactNode;
}) {
  const { dex, boat, rod, artifacts } = view;
  return (
    <div className={layout === 'grid' ? 'grid grid-cols-2 grid-rows-[auto_auto] gap-3 mobile:grid-cols-1' : 'flex flex-col gap-3'}>
      <Inset className={cx('px-3 py-2.5 flex flex-col gap-2 min-w-0', layout === 'grid' && 'row-span-2 mobile:row-span-1')}>
        <div className="flex items-center gap-2.5 min-h-8">
          {boat.tier > 0 && <BoatSprite tier={boat.tier} preset="row" />}
          {online && <span className="size-2 shrink-0 bg-accent" role="img" aria-label="접속 중" />}
          <b className="text-sm truncate">{name}</b>
        </div>
        <ul className="flex flex-col text-xs">
          <ProfileRow label="명성"><span className="pf-accent">{fmtNum(view.fame)}</span></ProfileRow>
          <ProfileRow label={<Tip text={DEX_HELP}>도감</Tip>}><span className="pf-accent">{dex.found} / {dex.total}</span></ProfileRow>
          <ProfileRow label="배">
            {boat.tier > 0 ? <>{boat.name} <span className="text-text-dim">({boat.tier}단계)</span></> : '없음'}
          </ProfileRow>
          <ProfileRow label="낚싯대"><span className="pf-accent">Lv.{rod.level}</span></ProfileRow>
          <ProfileRow label="파워"><span className="pf-accent">{rod.power}</span></ProfileRow>
        </ul>
        {actions && <div className="mt-auto pt-1">{actions}</div>}
      </Inset>
      <Inset className="px-3 py-2.5 flex flex-col gap-1.5 min-w-0">
        <span className="text-2xs text-text-dim">해역별 도감</span>
        {dex.zones.map(z => (
          <div key={z.zone} className="grid grid-cols-[8.5em_minmax(0,1fr)_4.6em] items-center gap-2 h-5 text-2xs whitespace-nowrap"
               aria-label={`${z.name} 도감 ${z.found}/${z.total}`}>
            <span className="truncate">{z.name}</span>
            <span className="block h-1.5 border border-line bg-bg shadow-[inset_1px_1px_0_var(--bevel-hi)]">
              <span className={cx('block h-full', z.complete ? 'bg-gold' : 'bg-accent')}
                    style={{ width: `${z.total ? (z.found / z.total) * 100 : 0}%` }} />
            </span>
            <span className="pf-accent text-right">{z.found} / {z.total}</span>
          </div>
        ))}
      </Inset>
      <Inset className="px-3 py-2.5 flex flex-col gap-1.5 min-w-0">
        <span className="flex justify-between text-2xs text-text-dim">
          <span>유물</span><span className="pf-accent">{artifacts.owned} / {artifacts.slots.length}</span>
        </span>
        <ul className="grid grid-cols-4 gap-1.5">
          {artifacts.slots.map(s => (
            <li key={s.id}
                className={cx('h-9 border-2 p-0.5 flex items-center justify-center text-center text-2xs leading-tight',
                  s.grade ? cx('bg-bg', GRADE_CLASS[s.grade]) : 'border-dashed border-line text-text-dim')}
                aria-label={s.name ? `유물 ${s.name}` : `${s.zone} 유물 없음`}>
              {s.name ?? s.zone}
            </li>
          ))}
        </ul>
      </Inset>
    </div>
  );
}

/** 요약 칸의 한 줄: 이름은 왼쪽(보조색), 값은 오른쪽 */
function ProfileRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-2 h-[26px] [&+&]:border-t [&+&]:border-line/60">
      <span className="text-text-dim">{label}</span>
      <span className="truncate">{children}</span>
    </li>
  );
}

/** 채팅 이름에서 여는 플레이어 정보 창 */
export default function PlayerModal({ onClose, ...props }: Parameters<typeof PlayerInfo>[0] & { onClose: () => void }) {
  return (
    <Modal layer="stage" onClose={onClose}>
      <ModalCard title={props.self ? '내 정보' : '플레이어 정보'} onClose={onClose}>
        <PlayerInfo {...props} layout="stack" />
      </ModalCard>
    </Modal>
  );
}
