import type { ReactNode } from 'react';
import { cx } from './cx';
import { FIELD_BOX } from './fieldStyle';
import PixelIcon from './PixelIcon';

// details/summary 아코디언 (구 .patch-acc) — 마커는 ▸/▾ 픽셀 화살표, 기본 닫힘
export default function Accordion({ summary, className, children }: {
  summary: ReactNode; className?: string; children: ReactNode;
}) {
  return (
    <details className={cx('group', FIELD_BOX, className)}>
      <summary
        className={cx(
          'flex items-baseline gap-2 p-2 cursor-pointer list-none text-sm hover:bg-surface-2',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <span className="text-text-dim shrink-0 group-open:hidden"><PixelIcon glyph="caretRight" size={8} /></span>
        <span className="text-text-dim shrink-0 hidden group-open:inline"><PixelIcon glyph="caretDown" size={8} /></span>
        {summary}
      </summary>
      {children}
    </details>
  );
}
