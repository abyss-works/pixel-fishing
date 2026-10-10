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
}

// 투명 아이콘 버튼 — 행 내 잠금/체크/펼침 토글 공용. 색·여백은 호출부가 정한다.
export default function IconButton({ glyph, size = 12, tone, full, className, children, ...props }: IconButtonProps) {
  return (
    <button
      className={cx('inline-flex items-center bg-transparent border-0 cursor-pointer',
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
