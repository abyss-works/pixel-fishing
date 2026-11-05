import { useEffect, useRef, useState } from 'react';
import { useFriends } from '../../../../features/friends/service/useFriends';
import { useGuild } from '../../../../features/guild/service/useGuild';
import { useMailbox } from '../../../../features/mailbox/service/useMailbox';
import Frame from '../../../ui/Frame';
import { cx } from '../../../ui/cx';
import MenuList from '../../../ui/MenuList';
import type { Notify } from '../../../ui/hud/messageFeed';
import PixelIcon from '../../../ui/PixelIcon';
import type { GlyphId } from '../../../ui/PixelIcon';

// 게임 메뉴 — 게임 영역 오른쪽 위의 햄버거 버튼 하나. 누르면 아래로 길드, 소셜, 우편함 줄이 펼쳐진다.
// 줄은 라벨이 왼쪽, 아이콘이 오른쪽이고, 할 일이 있으면 라벨 옆에 수를 붙인다.
// 접힌 상태에서는 알릴 것이 하나라도 있으면 버튼 모서리에 빨간 점을 찍는다.
// 입구마다 보이는 조건은 그대로다: 길드와 소셜은 계정 유저만, 우편함은 클라우드 모드에서만 연다.
// 열 수 있는 입구가 하나도 없으면 버튼도 그리지 않는다.

interface Entry {
  key: string;
  label: string;
  glyph: GlyphId;
  count: number;
  /** 수가 있을 때의 접근 이름 */
  countLabel: (n: number) => string;
  onOpen: () => void;
}

export default function GameMenu({ account, onGuild, onFriends, onMailbox, setToast }: {
  account: string | null;
  onGuild: () => void;
  onFriends: () => void;
  onMailbox: () => void;
  setToast: Notify;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const guild = useGuild(account !== null);
  const friends = useFriends(account !== null);
  const mailbox = useMailbox();
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

  const entries: Entry[] = [];
  if (guild.available) {
    entries.push({ key: 'guild', label: '길드', glyph: 'flag', count: 0, countLabel: () => '길드', onOpen: onGuild });
  }
  if (account !== null && !friends.offline) {
    entries.push({
      key: 'friends', label: '소셜', glyph: 'people', count: friends.groups?.incoming.length ?? 0,
      countLabel: n => `소셜, 받은 친구 요청 ${n}개`, onOpen: onFriends,
    });
  }
  if (!mailbox.offline) {
    entries.push({
      key: 'mailbox', label: '우편함', glyph: 'letter', count: mailbox.pending,
      countLabel: n => `우편함, 받지 않은 우편 ${n}통`, onOpen: onMailbox,
    });
  }
  if (entries.length === 0) return null;
  const alert = entries.some(e => e.count > 0);

  return (
    <div ref={root} className="absolute right-3 top-3 z-(--z-overlay) flex flex-col items-end gap-1">
      <Frame as="button" type="button" onClick={() => setOpen(v => !v)}
             aria-expanded={open} aria-haspopup="menu"
             aria-label={`메뉴 ${open ? '닫기' : '열기'}${alert ? ', 새 알림 있음' : ''}`}
             className={cx('relative p-2 cursor-pointer', open ? 'text-gold' : 'text-text-dim hover:text-gold')}>
        <PixelIcon glyph="menu" size={20} />
        {alert && !open && <span className="absolute right-1 top-1 size-[7px] bg-danger" aria-hidden="true" />}
      </Frame>
      {open && (
        <MenuList className="min-w-[150px] p-1" items={entries.map(e => ({
          key: e.key,
          label: e.count > 0 ? e.countLabel(e.count) : e.label,
          onSelect: () => { setOpen(false); e.onOpen(); },
          content: (
            <span className="grid w-full grid-cols-[1fr_auto_20px] items-center gap-2.5 h-9 px-2 text-sm">
              <span>{e.label}</span>
              <span className={cx(e.count > 0 && 'pf-accent px-1 text-2xs bg-danger text-bg')}>
                {e.count > 0 ? (e.count > 99 ? '99+' : e.count) : ''}
              </span>
              <PixelIcon glyph={e.glyph} size={16} className="text-text-dim" />
            </span>
          ),
        }))} />
      )}
    </div>
  );
}
