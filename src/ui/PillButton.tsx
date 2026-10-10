import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** true = 금색 활성 상태 */
  active?: boolean;
}

// 소형 테두리 알약 버튼 — 목록 내 보조 액션 공용 (미끼 활성·자동 잠금·어드민 재시도 등).
// pf-btn(베벨 확정 버튼)과 달리 평면이라 목록 행에 얹는다.
export default function PillButton({ active, className, children, ...props }: PillButtonProps) {
  return (
    <button
      className={cx('inline-flex items-center gap-1 border rounded-sm px-2 py-1 text-xs',
        'cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed',
        active ? 'border-gold text-gold bg-surface-2'
               : 'border-line text-text-dim hover:text-gold hover:border-gold',
        className)}
      {...props}
    >
      {children}
    </button>
  );
}
