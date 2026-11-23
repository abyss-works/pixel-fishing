import type { ReactNode } from 'react';
import { cx } from './cx';
import { NOTCH_SM } from './notch';

// 꼬리표 — 작은 노치 테두리 칩. 단계·해금·보유·할인처럼 머리글 아래에 붙는 짧은 사실 하나.
export default function Badge({ children }: { children: ReactNode }) {
  return <span className={cx('shrink-0 whitespace-nowrap text-xs px-1.5 py-0.5 border border-line text-text-dim bg-bg', NOTCH_SM)}>{children}</span>;
}
