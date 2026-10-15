import type { SelectHTMLAttributes } from 'react';
import { cx } from './cx';

// 선택 상자 — TextInput과 같은 테두리·배경·포커스 규칙. compact는 표 셀용(픽셀 액센트, 작은 글자).
export default function Select({ compact, className, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }) {
  return (
    <select
      className={cx('bg-bg border border-line rounded-sm text-text outline-none focus:border-accent',
        compact ? 'pf-accent text-xs px-1 py-0.5' : 'px-3 py-2 text-sm', className)}
      {...props}
    />
  );
}
