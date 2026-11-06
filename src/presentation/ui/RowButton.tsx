import { cx } from './cx';
import Frame from './Frame';
import PixelIcon from './PixelIcon';
import type { GlyphId } from './PixelIcon';

// 줄 버튼 — 아이콘과 제목으로 된 볼록한 한 줄. 누르면 창을 연다.
// 연 창이 떠 있는 동안(pressed)은 눌리고 골드 테두리로 선다. 높이는 상태와 무관하게 같다.
export default function RowButton({ glyph, title, pressed = false, onClick }: {
  glyph: GlyphId;
  title: string;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <Frame as="button" type="button" aria-pressed={pressed} onClick={onClick}
           className={cx('flex items-center gap-2.5 h-12 px-2.5 w-full text-left cursor-pointer bg-surface-2',
             pressed
               ? 'border-gold translate-y-px shadow-[inset_-2px_-2px_0_var(--bevel-lo),inset_2px_2px_0_var(--bevel-hi)]'
               : 'hover:border-accent')}>
      <PixelIcon glyph={glyph} size={14} className={pressed ? 'text-gold' : 'text-text-dim'} />
      <b className={cx('text-sm', pressed && 'text-gold')}>{title}</b>
    </Frame>
  );
}
