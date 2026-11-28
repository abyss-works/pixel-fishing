import { useEffect, useRef, useState } from 'react';
import { useFriends } from '../../../../features/friends/service/useFriends';
import { useGuild } from '../../../../features/guild/service/useGuild';
import type { GameState } from '../../../../game/rules/logic';
import { menuGroups, menuMarkName, menuMarks } from '../../../../features/display/model/menuEntries';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import { useRewardsDue } from '../../../../features/display/service/useRewardsDue';
import type { MenuKey, MenuMark } from '../../../../features/display/model/menuEntries';
import { guestLock } from '../../../../features/display/model/menuLock';
import type { AccountLockState } from '../../../../features/display/model/menuLock';
import { useMailbox } from '../../../../features/mailbox/service/useMailbox';
import { MarkBorder, MarkDot } from '../../../ui/AttentionMark';
import { LockIcon } from '../../../ui/Locked';
import MenuList from '../../../ui/MenuList';
import type { Notify } from '../../../ui/hud/messageFeed';
import HudMenuButton from '../../../ui/hud/HudMenuButton';
import MobileHudMenuButton from '../../../ui/hud/MobileHudMenuButton';
import { useMobileLayout } from '../../../layouts/useMobileLayout';
import { HOTKEY_TIER, hasModifier, useKeyScope } from '../../../ui/hotkeys';
import PixelIcon from '../../../ui/PixelIcon';
import type { GlyphId } from '../../../ui/PixelIcon';

// 게임 메뉴 — 햄버거 버튼 하나. PC 레이아웃은 헤더 단계가 크기를 정하는 메뉴 버튼(HudMenuButton, 60px 또는 두 행 단계 40px), 모바일 레이아웃은 40px 메뉴 버튼(MobileHudMenuButton)이다. 누르면 아래로 업적, 의뢰, 운세, 길드, 친구, 우편함 줄이 펼쳐진다(순서는 menuKeys).
// 줄은 라벨이 왼쪽, 아이콘이 오른쪽이다. 글자 배지는 붙이지 않고, 켜진 표식(menuMarks)이 줄 안에서 자리를 차지하지 않는 점과 테두리로 보인다.
// 받을 보상이 있는 의뢰와 업적 줄은 금색 테두리, 읽지 않은 우편이 있는 우편함 줄은 빨간 점, 그 밖의 강조(받은 친구 요청, 길드의 대기 가입 신청과 남은 개인 강화 포인트)는 금색 점이다.
// 접힌 상태에서는 표식이 있으면 버튼 모서리에 점을 찍는다. 빨간 점과 금색 점이 함께 켜질 상태이면 빨간 점만 보인다.
// 입구마다 보이는 조건: 의뢰, 업적, 운세는 늘 보이고, 길드와 친구는 계정 유저만 열며, 우편함은 클라우드 모드에서만 보인다.
// 게스트 잠금을 적용하는 게스트에게는 의뢰, 업적, 길드, 친구, 우편함 다섯 줄이 자리 그대로 잠긴 줄(공용 잠금)로 보이고, 눌러도 창이 열리지 않으며 잠금 줄이 툴팁으로 열린다. 운세 줄은 열려 있어 오늘의 운세와 잠금 안내를 볼 수 있다.
// 잠긴 줄에는 표식이 없다.
// 자리는 헤더(HudHeader)가 정한다. 두 레이아웃 모두 헤더 오른쪽 끝에 놓이고, 펼친 줄은 버튼의 오른쪽 아래에 붙어 게임 영역 위에 겹쳐 뜨므로 헤더 행의 높이를 바꾸지 않는다.

interface Entry {
  key: MenuKey;
  label: string;
  /** 줄의 접근성 이름 */
  name: string;
  glyph: GlyphId;
  /** 줄에 켜진 표식 */
  mark: MenuMark | undefined;
  /** 게스트 잠금 줄. 있으면 잠긴 줄이다 */
  lock: readonly string[] | null;
  onOpen: () => void;
}

function GameMenuEscScope({ onClose }: { onClose: () => void }) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useKeyScope(e => {
    if (e.key !== 'Escape' || hasModifier(e)) return;
    e.preventDefault();
    closeRef.current();
    return true;
  }, { tier: HOTKEY_TIER.POPOVER });
  return null;
}

export default function GameMenu({ game, account, accountState, onQuests, onAchievements, onFortune, onRanking, onGuild, onFriends, onMailbox, setToast }: {
  /** 업적 상태를 읽는 게임 상태 */
  game: GameState;
  account: string | null;
  /** 잠금 판정에 쓰는 계정 상태 */
  accountState: AccountLockState;
  onQuests: () => void;
  onAchievements: () => void;
  onFortune: () => void;
  onRanking: () => void;
  onGuild: () => void;
  onFriends: () => void;
  onMailbox: () => void;
  setToast: Notify;
}) {
  const mobile = useMobileLayout();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const guild = useGuild(account !== null);
  const friends = useFriends(account !== null);
  const mailbox = useMailbox();
  const rewards = useRewardsDue(game, accountState);
  const { mails, takeLoginNotice } = mailbox;

  // 접속한 계정의 첫 조회에서 받지 않은 우편이 있으면 한 번 안내만 띄운다(열어 보는 것은 플레이어가 한다)
  useEffect(() => {
    if (accountState === 'account' && takeLoginNotice()) {
      sendNotice(setToast, {
        kind: 'mail.unreadOnLogin',
        text: '받지 않은 우편이 있어요. 오른쪽 위 메뉴의 우편함에서 확인해 주세요.',
        toastText: '받지 않은 우편이 있어요.',
      });
    }
  }, [mails, takeLoginNotice, setToast, accountState]);

  // 펼친 동안 메뉴 밖을 누르면 접는다 (Esc는 GameMenuEscScope가 키 스코프로 처리)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const friendRequests = friends.groups?.incoming.length ?? 0;
  const marks = menuMarks({ lines: rewards.lines, friendRequests, guild: guild.guild, accountState });
  const entry = (key: MenuKey, label: string, glyph: GlyphId, onOpen: () => void): Entry => {
    const mark = marks.items[key];
    return { key, label, name: menuMarkName(label, mark), glyph, mark, lock: null, onOpen };
  };
  const byKey: Record<MenuKey, Entry> = {
    fortune: entry('fortune', '운세', 'sparkle', onFortune),
    ranking: entry('ranking', '랭킹', 'crown', onRanking),
    achievements: entry('achievements', '업적', 'star', onAchievements),
    quests: entry('quests', '의뢰', 'book', onQuests),
    guild: entry('guild', '길드', 'flag', onGuild),
    friends: entry('friends', '친구', 'people', onFriends),
    mailbox: entry('mailbox', '우편함', 'letter', onMailbox),
  };
  const liveAvailable = !mailbox.offline;
  const resolveEntry = (key: MenuKey): Entry => {
    const lock = guestLock(key, accountState);
    // 잠긴 줄은 알릴 것이 없다. 접근성 이름도 표식 없이 라벨만 쓴다
    return lock ? { ...byKey[key], name: byKey[key].label, mark: undefined, lock } : byKey[key];
  };
  const groups = menuGroups({
    ranking: liveAvailable,
    guild: guild.available || accountState !== 'account',
    friends: (account !== null && !friends.offline) || accountState !== 'account',
    mailbox: liveAvailable,
  }).map(group => ({
    key: group.key,
    label: group.label,
    entries: group.keys.map(resolveEntry),
  }));
  const toggle = () => setOpen(v => !v);
  const label = `메뉴 ${open ? '닫기' : '열기'}${marks.button ? ', 새 알림 있음' : ''}`;

  return (
    <div ref={root} className="relative flex flex-col items-end gap-1">
      {mobile ? (
        <MobileHudMenuButton open={open} mark={marks.button} onClick={toggle} aria-expanded={open} aria-haspopup="menu" aria-label={label} />
      ) : (
        <HudMenuButton open={open} mark={marks.button} onClick={toggle} aria-expanded={open} aria-haspopup="menu" aria-label={label} />
      )}
      {open && (
        <>
          <GameMenuEscScope onClose={() => setOpen(false)} />
          <MenuList
            className="absolute right-0 top-full mt-1 min-w-[150px] p-1"
            groups={groups.map(group => ({
              key: group.key,
              label: group.label,
              items: group.entries.map(e => ({
                key: e.key,
                label: e.name,
                lock: e.lock ?? undefined,
                onSelect: () => { setOpen(false); e.onOpen(); },
                content: (
                  <span className="relative grid w-full grid-cols-[1fr_auto_20px] items-center gap-2.5 h-9 px-2 text-sm">
                    <span>{e.label}</span>
                    <span className="flex items-center gap-1">{e.lock && <LockIcon />}</span>
                    <PixelIcon glyph={e.glyph} size={16} className="text-text-dim" />
                    {e.mark === 'reward' && <MarkBorder motion="blink" />}
                    {e.mark === 'mail' && <MarkDot tone="danger" motion="sparkle" />}
                    {e.mark === 'accent' && <MarkDot tone="gold" />}
                  </span>
                ),
              })),
            }))}
          />
        </>
      )}
    </div>
  );
}
