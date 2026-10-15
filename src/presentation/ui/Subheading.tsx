import type { ReactNode } from 'react';
import { cx } from './cx';

// 목록·표 위의 작은 소제목 — 보조색, 밑줄 없음. 가방 미끼·전시대, 도감 수역, 스탯 낚싯대처럼
// 한 화면 안에서 묶음을 가르는 자리에 쓴다. 화면 제목은 PageTitle, 본문 섹션은 SectionTitle.
export default function Subheading({ className, children }: { className?: string; children: ReactNode }) {
  return <h5 className={cx('text-sm text-text-dim mb-1', className)}>{children}</h5>;
}
