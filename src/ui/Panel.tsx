import type { ReactNode } from 'react';

interface PanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

// 노치+베벨 프레임 박스 — 정비 패널/사이드카드/월드맵 등 박스형 콘텐츠 공통 컨테이너
export default function Panel({ title, children, className = '' }: PanelProps) {
  return (
    <div className={`pf-frame pf-panel-pad ${className}`.trim()}>
      {title && <h3 className="pf-accent" style={{ fontSize: 'var(--fs-md)', color: 'var(--c-gold)' }}>{title}</h3>}
      {children}
    </div>
  );
}
