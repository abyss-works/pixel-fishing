import type { ReactNode } from 'react';
import { cx } from './cx';

// 탭/모달 본문의 섹션 제목 — 구 .side-panel h4 / .help-tab h4 계열 통합 (밑선 버전으로 통일)
export default function SectionTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h4 className={cx('text-sm text-accent mt-3 mb-1 pb-1 border-b border-line first:mt-0', className)}>
      {children}
    </h4>
  );
}
