import type { ReactNode } from 'react';
import { cx } from './cx';

// 화면·모달 제목 — 골드 + 픽셀 액센트(헤딩은 표시 서체, 디자인 시스템). 탭 페이지·앱 모달·
// 직접 만든 모달 제목이 크기·서체를 제각각 들고 있던 것을 여기 한 벌로 모은다.
// 섹션 제목은 SectionTitle(액센트 밑줄), 목록 소제목은 Subheading(보조색)이다.
export default function PageTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h3 className={cx('pf-accent text-lg text-gold', className)}>{children}</h3>;
}
