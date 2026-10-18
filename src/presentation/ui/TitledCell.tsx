import type { HTMLAttributes, ReactNode } from 'react';
import SectionTitle from './SectionTitle';
import { cx } from './cx';

// 제목 달린 칸 — 섹션 제목 아래에 오목한 칸(Inset)을 두는 그리드 한 칸이다. 같은 줄의 칸과 높이를 맞추고,
// 안쪽 Inset이 남은 높이를 채운다(flex-1). 도감 상세와 관리자 대시보드의 메인 그리드가 쓴다.
// title은 문자열 외에, 제목 줄 안에 조작(접기 토글 등)을 둘 때 노드로 줄 수 있다.
export default function TitledCell({ title, className, children, ...rest }: {
  title: ReactNode;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'title' | 'className' | 'children'>) {
  return (
    <section className={cx('flex min-w-0 flex-col', className)} {...rest}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}
