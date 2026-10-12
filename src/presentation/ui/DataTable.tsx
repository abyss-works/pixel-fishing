import type { ReactNode } from 'react';
import { cx } from './cx';

// 공통 표 (구 .data-table/.pf-compare 통합) — 셀 스타일은 index.css .pf-table가 후손 셀렉터로
// 담당한다(모든 셀에 유틸을 반복하는 것보다 낫다). 열 구성은 호출부가 thead/tbody로 조립.
export default function DataTable({ className, children }: { className?: string; children: ReactNode }) {
  return <table className={cx('pf-table', className)}>{children}</table>;
}
