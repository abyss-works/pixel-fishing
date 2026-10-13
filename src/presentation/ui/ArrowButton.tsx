import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';
import PixelIcon from './PixelIcon';

interface ArrowButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'dir'> {
  dir: 1 | -1;
  /** 전폭 블록 — 좌우로 채운다 */
  full?: boolean;
}

// 좌우 화살표 버튼 — 캐러셀·상세보기·수역 넘김 공용. 색·여백은 호출부가 정한다.
export default function ArrowButton({ dir, full, className, ...props }: ArrowButtonProps) {
  return (
    <button
      aria-label={dir < 0 ? '이전' : '다음'}
      className={cx('inline-flex items-center justify-center border border-line rounded-sm',
        'cursor-pointer transition', full && 'w-full', className)}
      {...props}
    >
      <PixelIcon glyph="caretRight" size={10} className={dir < 0 ? 'rotate-180' : undefined} />
    </button>
  );
}
