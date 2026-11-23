import type { ReactNode } from 'react';
import { cx } from './cx';
import { NOTCH_SM } from './notch';

const TONE = {
  dim: 'border-line text-text-dim bg-bg',
  gold: 'border-gold text-gold bg-[color-mix(in_oklab,var(--c-gold)_12%,transparent)]',
  'gold-plain': 'border-gold text-gold',
  accent: 'border-accent text-accent',
  'dim-plain': 'border-line text-text-dim',
} as const;

const SIZE = {
  sm: 'text-xs px-1.5 py-0.5',
  xs: 'text-2xs px-1.5 py-0.5',
  '2xs': 'text-2xs px-1',
  square: 'w-4 h-4 justify-center text-2xs',
} as const;

// 꼬리표 — 작은 노치 테두리 칩. 단계·해금·보유·할인·상태 표시 등 짧은 사실 하나.
export default function Badge({
  tone = 'dim',
  size = 'sm',
  pixel = false,
  inline = false,
  className,
  children,
}: {
  tone?: keyof typeof TONE;
  size?: keyof typeof SIZE;
  pixel?: boolean;
  inline?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cx(
      inline ? 'inline-flex items-center gap-1' : 'inline-block',
      'shrink-0 whitespace-nowrap border',
      TONE[tone],
      SIZE[size],
      pixel && 'pf-accent',
      NOTCH_SM,
      className,
    )}>
      {children}
    </span>
  );
}
