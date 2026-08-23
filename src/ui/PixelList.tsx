import type { ReactNode } from 'react';
import { cx } from './cx';

// 픽셀 사각 마커 목록 (구 .help-list) — 기본 불릿 대신 4px 사각 + 항목 간 여백.
// 자식은 <li> — 강조(b)는 골드로 자동 처리.
export default function PixelList({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <ul
      className={cx(
        'list-none mb-2 text-sm leading-[1.7] text-text flex flex-col gap-1 [&_b]:text-gold',
        '[&>li]:relative [&>li]:pl-3',
        "[&>li]:before:content-[''] [&>li]:before:absolute [&>li]:before:left-0.5 [&>li]:before:top-[0.65em] [&>li]:before:size-1 [&>li]:before:bg-accent",
        className,
      )}
    >
      {children}
    </ul>
  );
}
