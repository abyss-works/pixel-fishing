import type { ReactNode } from 'react';
import SectionTitle from '../../../../ui/SectionTitle';
import { cx } from '../../../../ui/cx';

/** 도감·네임드 상세의 메인 그리드 한 칸 — 섹션 제목 아래 오목한 칸이 남은 높이를 채운다 */
export default function DetailCell({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={cx('flex min-w-0 flex-col', className)}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}
