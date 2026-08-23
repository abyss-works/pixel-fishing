import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

type Variant = 'default' | 'primary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** sm = 목록형 보조 버튼(설정 탭 등) — 패딩·글자만 줄인다 */
  size?: 'md' | 'sm';
}

// 픽셀 베벨 버튼 — variant로 위계 구분 (확정=primary는 항상 전폭 블록, 보조=ghost)
export default function Button({ variant = 'default', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cx('pf-btn', variant !== 'default' && variant, size === 'sm' && 'px-2 py-1 text-sm', className)}
      {...props}
    />
  );
}
