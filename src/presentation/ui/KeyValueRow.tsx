import type { ReactNode } from 'react';
import { cx } from './cx';

// 요약 줄 — 이름(보조색) · 현재 값 · 오른쪽 동작. 고치는 일은 동작이 여는 창에서 한다.
// 구분선 틀(Frame divided) 안에 여러 줄을 쌓는다. valueEnd를 주면 값을 줄 오른쪽 끝에 붙인다(영수증처럼 이름 왼쪽, 값 오른쪽).
export default function KeyValueRow({ label, value, action, valueEnd }: {
  label: ReactNode; value: ReactNode; action?: ReactNode; valueEnd?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
      <span className="text-text-dim shrink-0">{label}</span>
      <span className={cx('truncate flex-1', valueEnd && 'text-right')}>{value}</span>
      {action}
    </div>
  );
}
