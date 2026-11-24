import type { ReactNode } from 'react';
import { cx } from './cx';

// 요약 줄 — 이름(보조색) · 현재 값 · 오른쪽 동작. 고치는 일은 동작이 여는 창에서 한다.
// 구분선 틀(Frame/Inset divided) 안에 여러 줄을 쌓는다. valueEnd를 주면 값을 줄 오른쪽 끝에 붙인다.
// compact는 표/카드 내부 26px 조밀한 키-값 행에 쓴다.
export default function KeyValueRow({
  as: Tag = 'div',
  label,
  value,
  action,
  valueEnd,
  compact = false,
  className,
  valueClassName,
}: {
  as?: 'div' | 'li';
  label: ReactNode;
  value: ReactNode;
  action?: ReactNode;
  valueEnd?: boolean;
  compact?: boolean;
  className?: string;
  valueClassName?: string;
}) {
  if (compact) {
    return (
      <Tag className={cx(
        'flex items-center justify-between gap-2 h-[26px] text-xs border-t border-line/60 first:border-t-0',
        className,
      )}>
        <span className="text-text-dim shrink-0">{label}</span>
        <span className={cx('min-w-0 truncate text-right', valueClassName)}>{value}</span>
      </Tag>
    );
  }
  return (
    <Tag className={cx('flex items-center gap-2 px-2 py-1.5 text-sm', className)}>
      <span className="text-text-dim shrink-0">{label}</span>
      <span className={cx('truncate flex-1', valueEnd && 'text-right', valueClassName)}>{value}</span>
      {action}
    </Tag>
  );
}
