import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';
import PixelIcon from './PixelIcon';

// 이전/다음 화살표 버튼 — 넘기기 조작의 공용 버튼.
// tone: plain = 글자색만 바뀌는 기본, solid = 면이 있는 큰 넘기기(도감 형태), edge = 가로 스크롤 가장자리 띠.
const TONE = {
  plain: 'px-2 py-0.5 text-text-dim hover:text-text',
  solid: 'bg-surface-2 text-text px-1 py-2 hover:bg-line',
  edge: 'bg-bg/85 text-text-dim hover:text-text',
} as const;

interface ArrowButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'dir'> {
  dir: 1 | -1;
  tone?: keyof typeof TONE;
  /** 전폭 블록 — 좌우로 채운다 */
  full?: boolean;
}

export default function ArrowButton({ dir, tone = 'plain', full, className, ...props }: ArrowButtonProps) {
  return (
    <button
      type="button"
      aria-label={dir < 0 ? '이전' : '다음'}
      className={cx('inline-flex items-center justify-center border border-line rounded-sm',
        'cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed',
        TONE[tone], full && 'w-full', className)}
      {...props}
    >
      <PixelIcon glyph="caretRight" size={10} className={dir < 0 ? 'rotate-180' : undefined} />
    </button>
  );
}
