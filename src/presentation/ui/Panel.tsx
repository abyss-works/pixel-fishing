import type { ReactNode } from 'react';
import { cx } from './cx';

interface PanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

// 노치+베벨 프레임 박스 — 정비 패널/사이드 카드 등 박스형 콘텐츠 공통 컨테이너
export default function Panel({ title, children, className }: PanelProps) {
  return (
    <div className={cx('pf-frame p-2 flex flex-col gap-2', className)}>
      {title && <h3 className="pf-accent text-base text-gold">{title}</h3>}
      {children}
    </div>
  );
}
