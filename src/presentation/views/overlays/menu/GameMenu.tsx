import { useEffect, useRef, useState } from 'react';
import { useFriends } from '../../../../features/friends/service/useFriends';
import { useGuild } from '../../../../features/guild/service/useGuild';
import type { ArtifactHolder } from '../../../../game/rules/artifactLevel';
import { clearsStatus } from '../../../../features/bounty/model/panel';
import { useBounty } from '../../../../features/bounty/service/useBounty';
import { menuKeys, questBadges, questMenuLabel } from '../../../../features/display/model/menuEntries';
import type { MenuKey } from '../../../../features/display/model/menuEntries';
import { useMailbox } from '../../../../features/mailbox/service/useMailbox';
import CountBadge from '../../../ui/CountBadge';
import MenuList from '../../../ui/MenuList';
import type { Notify } from '../../../ui/hud/messageFeed';
import HudMenuButton from '../../../ui/hud/HudMenuButton';
import MobileHudMenuButton from '../../../ui/hud/MobileHudMenuButton';
import { useMobileLayout } from '../../../layouts/useMobileLayout';
import PixelIcon from '../../../ui/PixelIcon';
import type { GlyphId } from '../../../ui/PixelIcon';

// 게임 메뉴 — 햄버거 버튼 하나. PC 레이아웃은 헤더 틀과 같은 높이(60px)의 메뉴 버튼(HudMenuButton), 모바일 레이아웃은 40px 메뉴 버튼(MobileHudMenuButton)이다. 누르면 아래로 의뢰, 길드, 소셜, 우편함 줄이 펼쳐진다(순서는 menuKeys).
// 줄은 라벨이 왼쪽, 아이콘이 오른쪽이고, 할 일이 있으면 라벨 옆에 수 배지를 붙인다. 의뢰 줄은 일반(노랑), 네임드(보라) 순으로 오늘 남은 클리어를 배지로 보인다.
// 접힌 상태에서는 새 알림(소셜의 받은 요청, 우편함의 받지 않은 우편)이 있으면 버튼 모서리에 빨간 점을 찍는다. 의뢰 배지는 점을 켜지 않는다.
// 입구마다 보이는 조건은 그대로다: 의뢰는 늘 열 수 있고, 길드와 소셜은 계정 유저만, 우편함은 클라우드 모드에서만 연다.
// 자리는 헤더(HudHeader)가 정한다. 모바일 레이아웃에서는 헤더 오른쪽 끝에 놓이고, 펼친 줄은 버튼 아래로 게임 영역 위에 겹쳐 뜬다.

interface Entry {
  key: MenuKey;
  label: string;
  /** 줄의 접근성 이름 */
  name: string;
  glyph: GlyphId;
  /** 줄에 붙는 배지 - 의뢰는 종류별 두 개, 나머지는 새 알림 수 하나 */
  badges: { tone: 'danger' | 'gold' | 'epic'; count: number }[];
  /** 메뉴 버튼의 새 알림 점을 켜는 수 */
  alerts: number;
  onOpen: () => void;
}

export default function GameMenu({ game, account, onQuests, onGuild, onFriends, onMailbox, setToast }: {
  /** 남은 클리어 횟수의 한도를 정하는 보유 유물 상태 */
  game: ArtifactHolder;
  account: string | null;
  onQuests: () => void;
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
  const { snap } = useBounty();
  const clearsLeft = clearsStatus(game, snap).left;
  const { mails, takeLoginNotice } = mailbox;

  // 접속한 계정의 첫 조회에서 받지 않은 우편이 있으면 한 번 안내만 띄운다(열어 보는 것은 플레이어가 한다)
  useEffect(() => {
    if (takeLoginNotice()) setToast('받지 않은 우편이 있어요. 오른쪽 위 메뉴의 우편함에서 확인해 주세요.', 'gold');
  }, [mails, takeLoginNotice, setToast]);

  // 펼친 동안 메뉴 밖을 누르거나 Esc를 누르면 접는다
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const friendRequests = friends.groups?.incoming.length ?? 0;
  const byKey: Record<MenuKey, Entry> = {
    quests: { key: 'quests', label: '의뢰', name: questMenuLabel(clearsLeft), glyph: 'book',
      badges: questBadges(clearsLeft), alerts: 0, onOpen: onQuests },
    guild: { key: 'guild', label: '길드', name: '길드', glyph: 'flag', badges: [], alerts: 0, onOpen: onGuild },
    friends: { key: 'friends', label: '소셜', glyph: 'people',
      name: friendRequests > 0 ? `소셜, 받은 친구 요청 ${friendRequests}개` : '소셜',
      badges: friendRequests > 0 ? [{ tone: 'danger', count: friendRequests }] : [], alerts: friendRequests, onOpen: onFriends },
    mailbox: { key: 'mailbox', label: '우편함', glyph: 'letter',
      name: mailbox.pending > 0 ? `우편함, 받지 않은 우편 ${mailbox.pending}통` : '우편함',
      badges: mailbox.pending > 0 ? [{ tone: 'danger', count: mailbox.pending }] : [], alerts: mailbox.pending, onOpen: onMailbox },
  };
  const entries = menuKeys({
    guild: guild.available, friends: account !== null && !friends.offline, mailbox: !mailbox.offline,
  }).map(key => byKey[key]);
  const alert = entries.some(e => e.alerts > 0);
  const toggle = () => setOpen(v => !v);
  const label = `메뉴 ${open ? '닫기' : '열기'}${alert ? ', 새 알림 있음' : ''}`;

  return (
    <div ref={root} className="relative flex flex-col items-end gap-1">
      {mobile ? (
        <MobileHudMenuButton open={open} alert={alert} onClick={toggle} aria-expanded={open} aria-haspopup="menu" aria-label={label} />
      ) : (
        <HudMenuButton open={open} alert={alert} onClick={toggle} aria-expanded={open} aria-haspopup="menu" aria-label={label} />
      )}
      {open && (
        <MenuList className="min-w-[150px] p-1 mobile:absolute mobile:right-0 mobile:top-full mobile:mt-1" items={entries.map(e => ({
          key: e.key,
          label: e.name,
          onSelect: () => { setOpen(false); e.onOpen(); },
          content: (
            <span className="grid w-full grid-cols-[1fr_auto_20px] items-center gap-2.5 h-9 px-2 text-sm">
              <span>{e.label}</span>
              <span className="flex items-center gap-1">
                {e.badges.map(b => <CountBadge key={b.tone} tone={b.tone} count={b.count} />)}
              </span>
              <PixelIcon glyph={e.glyph} size={16} className="text-text-dim" />
            </span>
          ),
        }))} />
      )}
    </div>
  );
}
