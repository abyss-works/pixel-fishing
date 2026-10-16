import type { AnchorHTMLAttributes } from 'react';
import { cx } from './cx';

// 링크 버튼 — 다른 페이지로 이동하는 링크를 버튼 모양(`pf-btn`)으로 그린다. 같은 페이지 동작은 Button.
export default function LinkButton({ variant = 'default', className, ...props }: {
  variant?: 'default' | 'primary' | 'ghost';
} & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={cx('pf-btn', variant !== 'default' && variant, className)} {...props} />;
}
