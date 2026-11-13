import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';
import PixelIcon from './PixelIcon';

// 작은 텍스트 링크 모양의 접고 펴는 버튼 — 같은 창 안에서 아래 내용을 펼치고 접는다. 새 창을 열지 않는다.
// 펼친 동안은 글자색이 밝아지고 기호가 아래를 가리킨다. 화면이 알리는 상태는 aria-expanded다.
export default function TextLinkButton({ open, className, children, ...props }: {
  open: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-expanded'>) {
  return (
    <button type="button" aria-expanded={open}
            className={cx('inline-flex items-center gap-1.5 text-xs underline underline-offset-[3px] cursor-pointer hover:text-text',
                          open ? 'text-text' : 'text-text-dim', className)}
            {...props}>
      <PixelIcon glyph={open ? 'caretDown' : 'caretRight'} size={8} />
      {children}
    </button>
  );
}
