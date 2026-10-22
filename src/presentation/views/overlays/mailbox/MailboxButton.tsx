import { useEffect, useRef } from 'react';
import { useMailbox } from '../../../../features/mailbox/service/useMailbox';
import Frame from '../../../ui/Frame';
import { cx } from '../../../ui/cx';
import type { Notify } from '../../../ui/hud/messageFeed';
import PixelIcon from '../../../ui/PixelIcon';

// 우편함 버튼 — 게임 영역 오른쪽 위. 할 일이 남은 우편 수를 붙인다. 우편함이 없는 로컬 모드에서는 그리지 않는다.
// 접속 뒤 처음으로 남은 우편을 확인하면 한 번 안내만 띄운다(열어 보는 것은 플레이어가 한다).
export default function MailboxButton({ onOpen, setToast }: { onOpen: () => void; setToast: Notify }) {
  const { mails, pending } = useMailbox();
  const noticed = useRef(false);

  useEffect(() => {
    if (noticed.current || pending === 0) return;
    noticed.current = true;
    setToast('받지 않은 우편이 있어요. 오른쪽 위 우편함에서 확인해 주세요.', 'gold');
  }, [pending, setToast]);

  if (mails === null) return null;
  return (
    <Frame as="button" type="button" onClick={onOpen}
           aria-label={pending > 0 ? `우편함, 받지 않은 우편 ${pending}통` : '우편함'} title="우편함"
           className={cx('absolute right-3 top-3 z-(--z-overlay) p-2 cursor-pointer',
             pending > 0 ? 'text-gold' : 'text-text-dim hover:text-gold')}>
      <PixelIcon glyph="letter" size={20} />
      {pending > 0 && (
        <span className="absolute -right-1.5 -top-1.5 min-w-4 px-1 text-[10px] leading-4 text-center bg-gold text-bg rounded-sm">
          {pending > 99 ? '99+' : pending}
        </span>
      )}
    </Frame>
  );
}
