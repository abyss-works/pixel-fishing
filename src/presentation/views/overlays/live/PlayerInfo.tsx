import { useState } from 'react';
import type { ReactNode } from 'react';
import { GUEST_LOCK_TEXT, guestLock } from '../../../../features/display/model/menuLock';
import { accountLockState } from '../../../../features/account/service/accountActions';
import { FRIEND_ERROR_TEXT, friendRelation } from '../../../../features/friends/model/friends';
import { useFriends } from '../../../../features/friends/service/useFriends';
import { useChatModeration } from '../../../../features/live/service/useChatModeration';
import type { ChatActionError } from '../../../../features/live/service/useChatModeration';
import { usePlayerProfile } from '../../../../features/live/service/usePlayerProfile';
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
import PersonSprite from '../../../ui/PersonSprite';
import Subheading from '../../../ui/Subheading';
import Tip, { TipList } from '../../../ui/Tip';
import { cx } from '../../../ui/cx';
import { fmtNum } from '../../../ui/format';

// 플레이어 정보 — PC 680 폭 2열 배치(모바일 1열 쌓기)로 요약, 업적, 수집품, 해역별 도감 비교를 보인다.
// 채팅 이름 클릭 창과 접속 목록 모두 같은 배치를 공유한다.
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
const DEX_HELP = '일반 폼과 돌연변이 폼으로 한 번이라도 낚은 어종';

export function PlayerInfo({ target, self, account, accountFailed = false, setToast }: {
  target: PlayerTarget;
  /** 내 정보인가 — 동작을 보이지 않는다 */
  self: boolean;
  /** 내 계정 이메일. 게스트면 null */
  account: string | null;
  /** 세션 확인에 실패했는가 */
  accountFailed?: boolean;
  setToast: Notify;
}) {
  const { profile, loading, failed } = usePlayerProfile(target.uid);
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
  const lock = guestLock('player', accountLockState(account, accountFailed));
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
    <ProfileCells name={name} view={selectProfileView(profile)} actions={actions} />
  );
}

// 등급색 — 가진 유물 칸의 테두리와 이름
const GRADE_CLASS: Record<NonNullable<ProfileView['collectibles']['artifacts']['slots'][number]['grade']>, string> = {
  common: 'border-common text-common',
  rare: 'border-rare text-rare',
  epic: 'border-epic text-epic',
  legendary: 'border-legend text-legend',
};

const pct = (value: number, total: number): number => (total > 0 ? Math.min(100, (value / total) * 100) : 0);

/** 요약, 업적, 수집품, 해역별 도감 비교. PC 2열(요약 왼쪽, 업적과 수집품 오른쪽, 도감 비교 하단 전폭), 모바일 1열 쌓기 */
function ProfileCells({ name, view, actions }: {
  name: string;
  view: ProfileView;
  actions: ReactNode;
}) {
  const { online, placeLabel, look, boat, rod, dex, achievements, collectibles } = view;
  const { hats, artifacts } = collectibles;
  const placeText = placeLabel ?? '위치 미상';

  return (
    <div className="grid grid-cols-[224px_minmax(0,1fr)] gap-3 mobile:grid-cols-1">
      {/* 왼쪽 열: 헤더(외형·배, 접속 상태, 닉네임, 위치) + 요약 + 동작 */}
      <Inset className="px-3 py-2.5 flex flex-col gap-2.5 min-w-0 row-span-2 mobile:row-span-1">
        <div className="flex items-center gap-2.5 min-w-0">
          {look ? (
            <Inset tone="light" className="shrink-0 w-11 h-12 flex items-center justify-center">
              <PersonSprite look={look} scale={2} />
            </Inset>
          ) : boat.tier > 0 ? (
            <BoatSprite tier={boat.tier} preset="row" />
          ) : null}
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              {online && <span className="size-2 shrink-0 bg-accent" role="img" aria-label="접속 중" />}
              <b className="text-sm truncate">{name}</b>
            </div>
            <span
              className={cx('text-xs truncate', online ? 'text-accent' : 'text-text-dim')}
              aria-label={online ? `현재 위치 ${placeText}` : `마지막 위치 ${placeText}`}
            >
              {placeText}
            </span>
          </div>
        </div>
        <ul className="flex flex-col text-xs">
          <ProfileRow label="명성"><span className="pf-accent">{fmtNum(view.fame)}</span></ProfileRow>
          <ProfileRow label="배">
            {boat.tier > 0 ? <>{boat.name} <span className="text-text-dim">({boat.tier}단계)</span></> : '없음'}
          </ProfileRow>
          <ProfileRow label="낚싯대"><span className="pf-accent">Lv.{rod.level}</span></ProfileRow>
          <ProfileRow label="파워"><span className="pf-accent">{fmtNum(rod.power)}</span></ProfileRow>
        </ul>
        {actions && <div className="mt-auto pt-1">{actions}</div>}
      </Inset>

      {/* 오른쪽 상단: 범주 1 업적 */}
      <Inset className="px-3 py-2.5 flex flex-col gap-2 min-w-0">
        <div className="flex items-center justify-between gap-2 text-2xs">
          <Subheading className="mb-0">업적</Subheading>
          <span className="text-text-dim">
            수령 완료 <span className="font-pixel text-gold">{achievements.claimed} / {achievements.total}</span>
          </span>
        </div>
        <span className="block h-2 border border-line bg-bg shadow-[inset_1px_1px_0_var(--bevel-hi)]"
              aria-label={`업적 달성 ${achievements.claimed}/${achievements.total}`}>
          <span className="block h-full bg-gold" style={{ width: `${pct(achievements.claimed, achievements.total)}%` }} />
        </span>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 mobile:grid-cols-1">
          {achievements.tabs.map(t => (
            <div key={t.tab} className="grid grid-cols-[5.2em_minmax(0,1fr)_3.6em] items-center gap-1.5 text-2xs whitespace-nowrap"
                 aria-label={`${t.label} 업적 ${t.claimed}/${t.total}`}>
              <span className="text-text-dim truncate">{t.label}</span>
              <span className="block h-1.5 border border-line bg-bg shadow-[inset_1px_1px_0_var(--bevel-hi)]">
                <span className="block h-full bg-gold" style={{ width: `${pct(t.claimed, t.total)}%` }} />
              </span>
              <span className="font-pixel text-gold text-right">{t.claimed}/{t.total}</span>
            </div>
          ))}
        </div>
      </Inset>

      {/* 오른쪽 하단: 범주 2 수집품 (모자 + 유물) */}
      <Inset className="px-3 py-2.5 flex flex-col gap-2 min-w-0">
        <div className="flex items-center justify-between gap-2 text-2xs">
          <Subheading className="mb-0">수집품</Subheading>
          <span className="pf-accent">{hats.owned + artifacts.owned} / {hats.total + artifacts.total}</span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-2xs">
            <span className="text-text-dim">
              <Tip
                text={(
                  <TipList
                    rows={[
                      { label: '구매', value: `${hats.goldOwned} / ${hats.goldTotal}` },
                      { label: '업적', value: `${hats.achievementOwned} / ${hats.achievementTotal}` },
                    ]}
                  />
                )}
              >
                모자
              </Tip>
            </span>
            <span className="pf-accent shrink-0">{hats.owned} / {hats.total}</span>
          </div>
          <span className="block h-1.5 border border-line bg-bg shadow-[inset_1px_1px_0_var(--bevel-hi)]"
                aria-label={`모자 수집 ${hats.owned}/${hats.total}`}>
            <span className={cx('block h-full', hats.owned === hats.total && hats.total > 0 ? 'bg-gold' : 'bg-accent')}
                  style={{ width: `${pct(hats.owned, hats.total)}%` }} />
          </span>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-line/60 pt-2">
          <div className="flex items-center justify-between gap-2 text-2xs text-text-dim">
            <span>유물</span>
            <span className="pf-accent">{artifacts.owned} / {artifacts.total}</span>
          </div>
          <ul className="grid grid-cols-3 gap-1.5 mobile:grid-cols-2">
            {artifacts.slots.map(s => (
              <li key={s.id}
                  className={cx('min-h-10 border-2 px-1 py-0.5 flex flex-col items-center justify-center text-center text-2xs leading-tight',
                    s.grade ? cx('bg-bg', GRADE_CLASS[s.grade]) : 'border-dashed border-line text-text-dim')}
                  aria-label={s.name ? (s.level !== null ? `유물 ${s.name} Lv.${s.level}` : `유물 ${s.name}`) : `${s.zone} 유물 없음`}>
                {s.name ? (
                  <>
                    <span className="truncate max-w-full">{s.name}</span>
                    {s.level !== null && <span className="font-pixel text-2xs opacity-85">Lv.{s.level}</span>}
                  </>
                ) : (
                  <span className="truncate max-w-full">{s.zone}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Inset>

      {/* 하단 전폭: 해역별 도감 (일반 + 돌연변이 나란히 비교) */}
      <Inset className="px-3 py-2.5 flex flex-col gap-1.5 min-w-0 col-span-2 mobile:col-span-1">
        <div className="flex flex-wrap items-center justify-between gap-2 text-2xs">
          <Subheading className="mb-0"><Tip text={DEX_HELP}>해역별 도감</Tip></Subheading>
          <div className="flex items-center gap-3">
            <span className="text-text-dim">일반 <span className="pf-accent">{dex.found} / {dex.total}</span></span>
            <span className="text-text-dim">돌연변이 <span className="font-pixel text-guild">{dex.variantFound} / {dex.total}</span></span>
          </div>
        </div>
        <div className="grid grid-cols-[7.5em_minmax(0,1fr)] gap-2.5 text-2xs text-text-dim border-b border-line/60 pb-1 mobile:hidden">
          <span>구역</span>
          <div className="grid grid-cols-2 gap-2.5">
            <span>일반 도감</span>
            <span>돌연변이 수집</span>
          </div>
        </div>
        {dex.zones.map(z => (
          <div key={z.zone} className="grid grid-cols-[7.5em_minmax(0,1fr)] items-center gap-2.5 text-2xs mobile:grid-cols-1 mobile:gap-1">
            <span className="truncate">{z.name}</span>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="grid grid-cols-[minmax(0,1fr)_4.2em] items-center gap-1.5 h-5 whitespace-nowrap"
                   aria-label={`${z.name} 일반 도감 ${z.found}/${z.total}`}>
                <span className="block h-1.5 border border-line bg-bg shadow-[inset_1px_1px_0_var(--bevel-hi)]">
                  <span className={cx('block h-full', z.complete ? 'bg-gold' : 'bg-accent')}
                        style={{ width: `${pct(z.found, z.total)}%` }} />
                </span>
                <span className={cx('text-right', z.complete ? 'font-pixel text-gold' : 'pf-accent')}>{z.found} / {z.total}</span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_4.2em] items-center gap-1.5 h-5 whitespace-nowrap"
                   aria-label={`${z.name} 돌연변이 도감 ${z.variantFound}/${z.total}`}>
                <span className="block h-1.5 border border-line bg-bg shadow-[inset_1px_1px_0_var(--bevel-hi)]">
                  <span className={cx('block h-full', z.variantComplete ? 'bg-gold' : 'bg-guild')}
                        style={{ width: `${pct(z.variantFound, z.total)}%` }} />
                </span>
                <span className={cx('font-pixel text-right', z.variantComplete ? 'text-gold' : 'text-guild')}>{z.variantFound} / {z.total}</span>
              </div>
            </div>
          </div>
        ))}
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

/** 채팅 이름에서 여는 플레이어 정보 창 — 접속 목록과 같은 680 폭 2열 배치를 쓴다 */
export default function PlayerModal({ onClose, ...props }: Parameters<typeof PlayerInfo>[0] & { onClose: () => void }) {
  return (
    <Modal layer="stage" md onClose={onClose}>
      <ModalCard title={props.self ? '내 정보' : '플레이어 정보'} onClose={onClose}>
        <PlayerInfo {...props} />
      </ModalCard>
    </Modal>
  );
}
