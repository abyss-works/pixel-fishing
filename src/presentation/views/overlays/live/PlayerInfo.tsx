import { useState } from 'react';
import type { ReactNode } from 'react';
import { GUEST_LOCK_TEXT, guestLock } from '../../../../features/display/model/menuLock';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import { accountLockState } from '../../../../features/account/service/accountActions';
import { FRIEND_ERROR_TEXT, friendRelation } from '../../../../features/friends/model/friends';
import { useFriends } from '../../../../features/friends/service/useFriends';
import { useChatModeration } from '../../../../features/live/service/useChatModeration';
import type { ChatActionError } from '../../../../features/live/service/useChatModeration';
import { usePlayerProfile } from '../../../../features/live/service/usePlayerProfile';
import { selectProfileView } from '../../../../features/live/model/profile';
import type { ProfileView } from '../../../../features/live/model/profile';
import Badge from '../../../ui/Badge';
import BoatSprite from '../../../ui/BoatSprite';
import Button from '../../../ui/Button';
import EmptyState from '../../../ui/EmptyState';
import { RarityText } from '../../../ui/fish/RarityTag';
import type { Notify } from '../../../ui/hud/messageFeed';
import Inset from '../../../ui/Inset';
import type { InsetBorder } from '../../../ui/Inset';
import ItemSprite from '../../../ui/ItemSprite';
import Locked from '../../../ui/Locked';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import PersonSprite from '../../../ui/PersonSprite';
import PixelIcon from '../../../ui/PixelIcon';
import ProgressCount from '../../../ui/ProgressCount';
import ProgressMeter from '../../../ui/ProgressMeter';
import { SCROLL_Y } from '../../../ui/scrollArea';
import Subheading from '../../../ui/Subheading';
import TabBar from '../../../ui/TabBar';
import Tip, { TipCard, TipList } from '../../../ui/Tip';
import ToggleChip from '../../../ui/ToggleChip';
import { cx } from '../../../ui/cx';
import { fmtNum } from '../../../ui/format';

// 플레이어 정보 — 상단 기본 정보(캐릭터·닉네임·위치·주요 스탯·관계 동작)와 하단 3개 서브탭(업적·수집품·도감 진척도)으로 나눈다.
// 플레이어 목록 창(xl) 우측과 단독 플레이어 창(md)이 같은 상세 구성을 공유한다.
// 동작(친구 요청, 차단, 채팅 글줄 신고)은 계정 유저만 쓴다. 게스트에게는 잠금 툴팁을 보이고 내 정보에는 동작이 없다.

export interface PlayerTarget {
  uid: string;
  /** 접속 목록이나 채팅 줄에 보인 이름 — 프로필을 읽기 전 제목에 쓴다 */
  nick: string;
  /** 채팅 글줄에서 열었으면 그 글줄 번호 */
  chatId?: number;
}

type ProfileSubtab = 'achievements' | 'collectibles' | 'dex';
type AchievementFilter = 'all' | 'progress' | 'cosmetic';

const ACHIEVEMENT_CATEGORIES: readonly { key: AchievementFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'progress', label: '진행' },
  { key: 'cosmetic', label: '치장' },
];

const BLOCK_ERROR_TEXT: Record<ChatActionError, string> = {
  guest: GUEST_LOCK_TEXT,
  missing: '대상을 찾을 수 없어요. 오래된 메시지는 신고할 수 없어요.',
  failed: '요청을 처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.',
};
const DEX_HELP = '일반과 돌연변이로 한 번이라도 낚은 어종';

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

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <Note>정보를 불러오는 중이에요.</Note>
      </div>
    );
  }
  if (failed || !profile) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <Note tone="warn">정보를 불러오지 못했어요.<br />잠시 뒤 다시 열어 주세요.</Note>
      </div>
    );
  }

  const name = profile.nickname ?? target.nick;
  const relation = friends.groups ? friendRelation(friends.groups, target.uid) : null;
  const blocked = moderation.isBlocked(target.uid);
  const chatId = target.chatId;

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true);
    try {
      const warn = await work();
      if (warn) sendNotice(setToast, { kind: 'system.modalRejected', text: warn });
    } catch {
      sendNotice(setToast, { kind: 'system.modalRejected', text: '요청을 보내지 못했어요. 연결을 확인해 주세요.' });
    } finally {
      setBusy(false);
    }
  };
  const befriend = (op: 'request' | 'accept') => run(async () => {
    const r = await friends.act(op === 'request' ? { op, nickname: name } : { op, uid: target.uid });
    if (!r.ok) return FRIEND_ERROR_TEXT[r.error] ?? '요청을 처리하지 못했어요. 잠시 뒤 다시 해 주세요.';
    sendNotice(setToast, {
      kind: 'social.modalAction',
      text: r.result === 'requested' ? `${name} 님에게 친구 요청을 보냈어요.`
        : r.result === 'already' ? `${name} 님과는 이미 친구이거나 요청 중이에요.` : `${name} 님과 친구가 됐어요.`,
      toastText: r.result === 'requested' ? `${name} 님 친구 요청 전송`
        : r.result === 'already' ? '이미 친구이거나 요청 중' : `${name} 님과 친구가 됐어요.`,
    });
    return null;
  });
  const block = (op: 'block' | 'unblock') => run(async () => {
    const error = await (op === 'block' ? moderation.block(target.uid) : moderation.unblock(target.uid));
    if (error) return BLOCK_ERROR_TEXT[error];
    sendNotice(setToast, {
      kind: 'social.modalAction',
      text: op === 'block' ? `${name} 님을 차단했어요. 이 사람의 채팅이 보이지 않아요.` : `${name} 님의 차단을 풀었어요.`,
      toastText: op === 'block' ? `${name} 님 차단 완료` : `${name} 님 차단 해제`,
    });
    return null;
  });
  const report = (chatId: number) => run(async () => {
    const error = await moderation.report(chatId);
    if (error) return BLOCK_ERROR_TEXT[error];
    setReported(true);
    sendNotice(setToast, {
      kind: 'social.modalAction',
      text: '신고했어요. 운영자가 확인할게요.',
      toastText: '채팅 신고를 접수했어요.',
    });
    return null;
  });

  // 친구 동작 자리: 관계에 따라 요청, 수락 버튼이나 관계 문구 하나
  const friendSlot = profile.account && !friends.offline && blocked === false && (
    relation === 'friend' ? <span className="text-xs text-accent">친구예요</span>
    : relation === 'outgoing' ? <span className="text-xs text-text-dim">친구 요청을 보냈어요</span>
    : relation === 'incoming' ? <Button variant="primary" size="sm" disabled={busy} onClick={() => void befriend('accept')}>친구 수락</Button>
    : friends.groups && <Button variant="primary" size="sm" disabled={busy} onClick={() => void befriend('request')}>친구 요청</Button>
  );
  const lock = guestLock('player', accountLockState(account, accountFailed));
  const actions = self ? null : lock ? (
    <div className="flex items-center gap-2">
      <Locked lines={lock} label="친구 요청">
        <Button variant="primary" size="sm" disabled>친구 요청</Button>
      </Locked>
      <Locked lines={lock} label="차단">
        <Button size="sm" disabled>차단</Button>
      </Locked>
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      {friendSlot}
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
  );

  return <ProfileDetail name={name} view={selectProfileView(profile)} actions={actions} />;
}

// 등급색 — 가진 유물 칸의 테두리와 이름
const GRADE_STYLE: Record<NonNullable<ProfileView['collectibles']['artifacts']['slots'][number]['grade']>, {
  border: InsetBorder;
  text: string;
}> = {
  common: { border: 'common', text: 'text-common' },
  rare: { border: 'rare', text: 'text-rare' },
  epic: { border: 'epic', text: 'text-epic' },
  legendary: { border: 'legend', text: 'text-legend' },
};

/** 상단 기본 정보 + 3개 서브탭(업적·수집품·도감 진척도) */
function ProfileDetail({ name, view, actions }: {
  name: string;
  view: ProfileView;
  actions: ReactNode;
}) {
  const [subtab, setSubtab] = useState<ProfileSubtab>('achievements');
  const [achCategory, setAchCategory] = useState<AchievementFilter>('all');
  const [claimedOnly, setClaimedOnly] = useState(false);

  const { online, placeLabel, look, boat, rod, achievements, collectibles } = view;
  const { hats, artifacts } = collectibles;
  const placeText = placeLabel ?? '위치 미상';

  return (
    <div className="flex flex-col gap-2.5 flex-1 min-h-0">
      {/* 상단 기본 정보: 캐릭터 · 닉네임 · 위치 · 주요 스탯 · 관계 동작 */}
      <Inset className="px-3 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {look ? (
            <Inset tone="light" borderless className="shrink-0 w-11 h-12 flex items-center justify-center">
              <PersonSprite look={look} scale={2} />
            </Inset>
          ) : boat.tier > 0 ? (
            <BoatSprite tier={boat.tier} preset="row" />
          ) : null}
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              {online && <span className="size-2 shrink-0 bg-accent" role="img" aria-label="접속 중" />}
              <b className="text-sm text-text truncate">{name}</b>
              <span
                className={cx('text-2xs truncate', online ? 'text-accent' : 'text-text-dim')}
                aria-label={online ? `현재 위치 ${placeText}` : `마지막 위치 ${placeText}`}
              >
                {placeText}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-text-dim">
              <span>명성 <ProgressCount value={fmtNum(view.fame)} /></span>
              <span>배 <b className="text-text">{boat.tier > 0 ? `${boat.name} (${boat.tier}단계)` : '없음'}</b></span>
              <span>낚싯대 <ProgressCount value={`Lv.${rod.level}`} /></span>
              <span>파워 <ProgressCount value={fmtNum(rod.power)} /></span>
            </div>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </Inset>

      {/* 3개 서브탭 */}
      <TabBar<ProfileSubtab>
        className="shrink-0"
        tabs={[
          { key: 'achievements', label: `업적 ${achievements.claimed}/${achievements.total}` },
          { key: 'collectibles', label: `수집품 ${hats.owned + artifacts.owned}/${hats.total + artifacts.total}` },
          { key: 'dex', label: '도감 진척도' },
        ]}
        activeKey={subtab}
        onSelect={setSubtab}
      />

      {subtab === 'achievements' && (
        <AchievementSubtab
          achievements={achievements}
          category={achCategory}
          onCategoryChange={setAchCategory}
          claimedOnly={claimedOnly}
          onToggleClaimedOnly={() => setClaimedOnly(v => !v)}
        />
      )}
      {subtab === 'collectibles' && <CollectiblesSubtab collectibles={collectibles} />}
      {subtab === 'dex' && <DexSubtab dex={view.dex} />}
    </div>
  );
}

function AchievementSubtab({
  achievements,
  category,
  onCategoryChange,
  claimedOnly,
  onToggleClaimedOnly,
}: {
  achievements: ProfileView['achievements'];
  category: AchievementFilter;
  onCategoryChange: (next: AchievementFilter) => void;
  claimedOnly: boolean;
  onToggleClaimedOnly: () => void;
}) {
  const filtered = achievements.items.filter(item =>
    (category === 'all' || item.tab === category) && (!claimedOnly || item.claimed));

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap gap-1">
          {ACHIEVEMENT_CATEGORIES.map(c => {
            const active = category === c.key;
            return (
              <ToggleChip
                key={c.key}
                size="sm"
                pressed={active}
                emphasis={active}
                onClick={() => onCategoryChange(c.key)}
              >
                {c.label}
              </ToggleChip>
            );
          })}
        </div>
        <ToggleChip size="sm" pressed={claimedOnly} emphasis={claimedOnly} onClick={onToggleClaimedOnly}>
          <PixelIcon glyph="check" size={10} />
          달성만 보기
        </ToggleChip>
      </div>

      <Inset tone="deep" className="flex-1 min-h-0 p-2.5 flex flex-col gap-2">
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 text-2xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-text-dim">
              달성 <ProgressCount current={achievements.claimed} target={achievements.total} />
            </span>
            <span className="text-text-dim">
              ({achievements.tabs.map(t => `${t.label} ${t.claimed}/${t.total}`).join(', ')})
            </span>
          </div>
          <ProgressMeter
            current={achievements.claimed}
            target={achievements.total}
            tone="gold"
            heightClass="h-1.5"
            className="w-36 shrink-0 mobile:w-full"
            ariaLabel={`업적 달성 ${achievements.claimed}/${achievements.total}`}
          />
        </div>

        <div className={`${SCROLL_Y} flex-1 min-h-0`}>
          {filtered.length === 0 ? (
            <EmptyState message="달성한 업적이 없어요." />
          ) : (
            <ul className="grid grid-cols-3 gap-1.5 mobile:grid-cols-2">
              {filtered.map(item => (
                <Inset
                  as="li"
                  key={item.id}
                  tone={item.claimed ? 'light' : 'deep'}
                  className={cx('px-2 py-1.5 flex items-center min-w-0', !item.claimed && 'border-dashed text-text-dim')}
                >
                  <Tip
                    plain
                    className="flex items-center justify-between gap-1.5 w-full min-w-0"
                    text={(
                      <TipCard
                        title={item.name}
                        subtitle={item.tabLabel}
                        badge={<Badge tone={item.claimed ? 'gold' : 'dim-plain'} size="xs">{item.claimed ? '달성' : '미달성'}</Badge>}
                        description={item.desc}
                        rows={[{ label: '보상', value: item.rewardText }]}
                      />
                    )}
                  >
                    <span className={cx('text-2xs break-keep break-words min-w-0', item.claimed ? 'text-text font-medium' : 'text-text-dim')}>
                      {item.name}
                    </span>
                    <span className={cx('text-2xs shrink-0', item.claimed ? 'text-gold font-bold' : 'text-text-dim')}>
                      {item.claimed ? '달성' : '미달성'}
                    </span>
                  </Tip>
                </Inset>
              ))}
            </ul>
          )}
        </div>
      </Inset>
    </div>
  );
}

function CollectiblesSubtab({ collectibles }: { collectibles: ProfileView['collectibles'] }) {
  const { artifacts, hats } = collectibles;
  return (
    <Inset tone="deep" className="flex-1 min-h-0 p-2.5 flex flex-col">
      <div className={`${SCROLL_Y} flex-1 min-h-0 flex flex-col gap-3`}>
        <section className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-2xs">
            <Subheading className="mb-0">유물</Subheading>
            <div className="flex items-center gap-2">
              <span className="text-text-dim">보유 {artifacts.owned} / 미보유 {artifacts.total - artifacts.owned}</span>
              <ProgressCount current={artifacts.owned} target={artifacts.total} />
            </div>
          </div>
          <ul className="grid grid-cols-4 gap-1.5 mobile:grid-cols-2">
            {artifacts.slots.map(s => {
              const gradeStyle = s.grade ? GRADE_STYLE[s.grade] : null;
              return (
                <Inset
                  as="li"
                  key={s.id}
                  tone={s.owned ? 'light' : 'deep'}
                  border={gradeStyle?.border}
                  className={cx(
                    'min-h-11 px-2 py-1.5 flex items-center min-w-0 text-2xs leading-tight',
                    gradeStyle ? gradeStyle.text : 'border-dashed text-text-dim',
                  )}
                  aria-label={s.name ? (s.level !== null ? `유물 ${s.name} Lv.${s.level}` : `유물 ${s.name}`) : `${s.zone} 유물 없음`}
                >
                  {s.name ? (
                    <Tip
                      plain
                      className="flex items-center gap-1.5 w-full min-w-0"
                      text={(
                        <TipCard
                          title={s.name}
                          subtitle={s.zone}
                          badge={s.grade ? <RarityText rarity={s.grade} /> : undefined}
                          rows={s.level !== null ? [{ label: '강화', value: `Lv.${s.level}` }] : undefined}
                        />
                      )}
                    >
                      <ItemSprite kind="artifact" id={s.id} preset="row" className="shrink-0" />
                      <span className="flex flex-col min-w-0">
                        <span className="break-keep break-words">{s.name}</span>
                        {s.level !== null && <span className="pf-accent text-2xs text-text-dim">Lv.{s.level}</span>}
                      </span>
                    </Tip>
                  ) : (
                    <span className="break-keep break-words">{s.zone}</span>
                  )}
                </Inset>
              );
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-1.5 border-t border-line/60 pt-2.5">
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
            <ProgressCount current={hats.owned} target={hats.total} className="shrink-0" />
          </div>
          <ul className="grid grid-cols-4 gap-1.5 mobile:grid-cols-2">
            {hats.slots.map(h => (
              <Inset
                as="li"
                key={h.id}
                tone={h.owned ? 'light' : 'deep'}
                className={cx(
                  'min-h-11 px-2 py-1.5 flex items-center min-w-0 text-2xs leading-tight',
                  !h.owned && 'border-dashed text-text-dim',
                )}
                aria-label={`모자 ${h.name} ${h.owned ? '보유' : '미보유'}`}
              >
                <Tip
                  plain
                  className="flex items-center gap-1.5 w-full min-w-0"
                  text={(
                    <TipCard
                      title={h.name}
                      subtitle={h.source === 'gold' ? '골드 구매' : '업적 보상'}
                      badge={<Badge tone={h.owned ? 'gold' : 'dim-plain'} size="xs">{h.owned ? '보유' : '미보유'}</Badge>}
                      description={h.conditionText}
                    />
                  )}
                >
                  <PersonSprite headOnly look={h.look} scale={2} className="shrink-0" />
                  <span className="flex flex-col min-w-0">
                    <span className={cx('break-keep break-words', h.owned ? 'text-text font-medium' : 'text-text-dim')}>{h.name}</span>
                    <span className={cx('text-2xs', h.owned ? 'text-accent' : 'text-text-dim')}>{h.owned ? '보유' : '미보유'}</span>
                  </span>
                </Tip>
              </Inset>
            ))}
          </ul>
        </section>
      </div>
    </Inset>
  );
}

function DexSubtab({ dex }: { dex: ProfileView['dex'] }) {
  return (
    <Inset tone="deep" className="flex-1 min-h-0 p-2.5 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-2xs shrink-0">
        <Subheading className="mb-0"><Tip text={DEX_HELP}>해역별 도감</Tip></Subheading>
        <div className="flex items-center gap-3">
          <span className="text-text-dim">일반 <ProgressCount current={dex.found} target={dex.total} /></span>
          <span className="text-text-dim">돌연변이 <ProgressCount current={dex.variantFound} target={dex.total} tone="guild" /></span>
        </div>
      </div>

      <div className={`${SCROLL_Y} flex-1 min-h-0 flex flex-col gap-1.5`}>
        <div className="grid grid-cols-[7.5em_minmax(0,1fr)] gap-2.5 text-2xs text-text-dim border-b border-line/60 pb-1 mobile:hidden shrink-0">
          <span>구역</span>
          <div className="grid grid-cols-2 gap-2.5">
            <span>일반 도감</span>
            <span>돌연변이 수집</span>
          </div>
        </div>
        {dex.zones.map(z => (
          <div
            key={z.zone}
            className="grid grid-cols-[7.5em_minmax(0,1fr)] items-center gap-2.5 text-2xs border-b border-line/40 pb-1.5 last:border-b-0 last:pb-0 mobile:grid-cols-1 mobile:gap-1 shrink-0"
          >
            <span className="truncate text-text">{z.name}</span>
            <div className="grid grid-cols-2 gap-2.5">
              <div
                className="grid grid-cols-[minmax(0,1fr)_4.2em] items-center gap-1.5 h-5 whitespace-nowrap"
                aria-label={`${z.name} 일반 도감 ${z.found}/${z.total}`}
              >
                <ProgressMeter
                  current={z.found}
                  target={z.total}
                  tone={z.complete ? 'gold' : 'accent'}
                  heightClass="h-1.5"
                  ariaLabel={`${z.name} 일반 도감`}
                />
                <ProgressCount current={z.found} target={z.total} className="text-right" />
              </div>
              <div
                className="grid grid-cols-[minmax(0,1fr)_4.2em] items-center gap-1.5 h-5 whitespace-nowrap"
                aria-label={`${z.name} 돌연변이 도감 ${z.variantFound}/${z.total}`}
              >
                <ProgressMeter
                  current={z.variantFound}
                  target={z.total}
                  tone={z.variantComplete ? 'gold' : 'guild'}
                  heightClass="h-1.5"
                  ariaLabel={`${z.name} 돌연변이 도감`}
                />
                <ProgressCount
                  current={z.variantFound}
                  target={z.total}
                  tone={z.variantComplete ? 'gold' : 'guild'}
                  className="text-right"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Inset>
  );
}

/** 채팅 이름에서 여는 플레이어 정보 창 — 접속 목록과 같은 상세 구성을 md(680px) 고정 높이 창으로 보인다 */
export default function PlayerModal({ onClose, ...props }: Parameters<typeof PlayerInfo>[0] & { onClose: () => void }) {
  return (
    <Modal layer="stage" md height={520} mobileFixed onClose={onClose}>
      <ModalCard title={props.self ? '내 정보' : '플레이어 정보'} onClose={onClose} fixed>
        <PlayerInfo {...props} />
      </ModalCard>
    </Modal>
  );
}
