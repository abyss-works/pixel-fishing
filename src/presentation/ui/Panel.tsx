import type { ReactNode } from 'react';
import { cx } from './cx';
import CloseButton from './CloseButton';

interface PanelProps {
  title?: string;
  /** 주어지면 우상단에 닫기 X를 둔다 (스테이지 모달 카드) */
  onClose?: () => void;
  children: ReactNode;
  className?: string;
}

// 노치+베벨 프레임 박스 — 정비 패널/사이드 카드 등 박스형 콘텐츠 공통 컨테이너
export default function Panel({ title, onClose, children, className }: PanelProps) {
  return (
    <div className={cx('pf-frame p-2 flex flex-col gap-2', onClose && 'relative', className)}>
      {title && <h3 className={cx('pf-accent text-base text-gold', onClose && 'pr-6')}>{title}</h3>}
      {onClose && <CloseButton onClose={onClose} />}
      {children}
    </div>
  );
}
