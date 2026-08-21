import type { ReactNode } from 'react';
import { cx } from './cx';

// 낮은 톤 안내문 (구 .panel-note) — warn은 위험색
export default function Note({ tone = 'info', className, children }: {
  tone?: 'info' | 'warn'; className?: string; children: ReactNode;
}) {
  return (
    <p className={cx('text-xs my-2', tone === 'warn' ? 'text-danger' : 'text-text-dim', className)}>
      {children}
    </p>
  );
}
