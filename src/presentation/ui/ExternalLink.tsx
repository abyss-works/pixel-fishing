import type { AnchorHTMLAttributes } from 'react';
import { cx } from './cx';
import PixelIcon from './PixelIcon';

// 글줄 안 또는 바닥줄의 외부 링크 — 다른 페이지(약관, 처리방침, 운영정책)를 새 탭으로 연다.
// 공용 툴팁의 점선 밑줄과 구분되도록 실선 밑줄을 쓰고, icon을 켜면 우측에 새 탭 아이콘을 붙인다.
export default function ExternalLink({
  icon = false,
  className,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { icon?: boolean }) {
  return (
    <a target="_blank" rel="noopener noreferrer"
       className={cx(
         'text-accent underline decoration-solid underline-offset-[3px] hover:text-text',
         icon && 'inline-flex items-center gap-[3px]',
         className,
       )} {...props}>
      {children}
      {icon && <PixelIcon glyph="external" size={10} className="shrink-0" />}
    </a>
  );
}
