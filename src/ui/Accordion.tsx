import type { ReactNode } from 'react';
import { cx } from './cx';

// details/summary 아코디언 (구 .patch-acc) — 마커는 ▸/▾ 픽셀 화살표, 기본 닫힘
export default function Accordion({ summary, className, children }: {
  summary: ReactNode; className?: string; children: ReactNode;
}) {
  return (
    <details className={cx('group border border-line rounded-sm bg-bg', className)}>
      <summary
        className={cx(
          'flex items-baseline gap-2 p-2 cursor-pointer list-none text-xs hover:bg-surface-2',
          '[&::-webkit-details-marker]:hidden',
          "before:content-['▸'] before:text-text-dim before:text-[10px] group-open:before:content-['▾']",
        )}
      >
        {summary}
      </summary>
      {children}
    </details>
  );
}
