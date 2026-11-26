import type { ButtonHTMLAttributes, Ref } from 'react';
import { cx } from './cx';

type Variant = 'default' | 'primary' | 'ghost' | 'accent' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** md = 기본 최소 44px(줄바꿈 시 세로로 함께 확장), sm = 목록형 보조 버튼(설정 탭 등), xs = 24px 이하 평면 1px 소형 버튼 */
  size?: 'md' | 'sm' | 'xs';
  /** 전폭 블록 — 좌우로 채운다 (variant와 무관) */
  full?: boolean;
  /** 이 버튼이 연 창이 떠 있는 동안의 눌린 모양 */
  pressed?: boolean;
  /** 팝오버가 연 버튼을 알아보게 넘긴다 */
  ref?: Ref<HTMLButtonElement>;
}

// 픽셀 베벨 버튼 — variant로 위계 구분 (확정=primary, 보조=ghost, 강조=accent, 경고=danger)
export default function Button({ variant = 'default', size = 'md', full, pressed, className, ...props }: ButtonProps) {
  return (
    <button
      className={cx('pf-btn gap-[5px]', variant !== 'default' && variant, size !== 'md' && size, full && 'full', pressed && 'pressed', className)}
      aria-pressed={pressed}
      {...props}
    />
  );
}
