import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';

// HUD 알약 — 캔버스 위에 뜨는 작은 값 표시(활성 미끼·시계 등)의 공통 껍데기.
// 바탕은 HUD 반투명 표면(pf-glass), 테두리는 둥근 선 하나다. size sm은 시계처럼 한 줄 글자만 담는 낮은 알약.
export default function HudChip({ size = 'md', className, children, ...rest }: {
  size?: 'sm' | 'md';
  className?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('pf-glass flex items-center gap-1.5 rounded-full border border-line',
                       size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1', className)}
         {...rest}>
      {children}
    </div>
  );
}
