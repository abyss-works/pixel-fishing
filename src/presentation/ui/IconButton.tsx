import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';
import PixelIcon from './PixelIcon';
import type { GlyphId } from './PixelIcon';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  glyph: GlyphId;
  size?: number;
  /** gold = 활성(잠김 등), dim = 기본, 생략 = 상속 */
  tone?: 'gold' | 'dim';
  /** 전폭 블록 — 좌우로 채운다 */
  full?: boolean;
  /** 평면 1px 테두리 박스 — 상태 아이콘 트리거 등에 쓴다 */
  boxed?: boolean;
}

// 투명 또는 1px 평면 테두리 아이콘 버튼 — 행 내 잠금/체크/상태 아이콘 공용. 색·여백은 호출부가 정한다.
export default function IconButton({ glyph, size = 12, tone, full, boxed, className, children, ...props }: IconButtonProps) {
  return (
    <button
      className={cx('inline-flex items-center cursor-pointer',
        boxed ? 'justify-center border bg-bg' : 'bg-transparent border-0',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        tone === 'gold' ? 'text-gold' : tone === 'dim' ? 'text-text-dim hover:text-text' : '',
        full && 'w-full justify-center',
        className)}
      {...props}
    >
      <PixelIcon glyph={glyph} size={size} />
      {children}
    </button>
  );
}
