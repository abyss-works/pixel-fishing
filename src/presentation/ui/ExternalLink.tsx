import type { AnchorHTMLAttributes } from 'react';
import { cx } from './cx';

// 글줄 안의 링크 — 문장 속에서 다른 페이지(약관, 처리방침)를 새 탭으로 연다. 이름 문장을 끊지 않도록 글자 크기와 줄 높이를 따른다.
// 버튼 모양의 링크는 LinkButton.
export default function ExternalLink({ className, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a target="_blank" rel="noopener noreferrer"
       className={cx('text-accent underline decoration-dotted underline-offset-[3px] hover:text-text', className)} {...props}>
      {children}
    </a>
  );
}
