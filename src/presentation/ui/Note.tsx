import type { ReactNode } from 'react';
import { cx } from './cx';

const SIZE = { sm: 'text-sm', xs: 'text-xs', '2xs': 'text-2xs leading-[1.6]' } as const;

// 낮은 톤 안내문 (구 .panel-note) — warn은 위험색. 본문은 sm, 표·카드 밑 보조 설명은 xs/2xs.
// 세로 여백은 기본 my-2이고, 호출자가 my-*를 주면 그쪽을 따른다.
export default function Note({ tone = 'info', size = 'sm', className, children }: {
  tone?: 'info' | 'warn'; size?: keyof typeof SIZE; className?: string; children: ReactNode;
}) {
  return (
    <p className={cx(SIZE[size], !className?.includes('my-') && 'my-2',
                     tone === 'warn' ? 'text-danger' : 'text-text-dim', className)}>
      {children}
    </p>
  );
}
