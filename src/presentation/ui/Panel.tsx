import { useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';
import CloseButton from './CloseButton';
import Frame from './Frame';
import { useModalTitle } from './modalTitleContext';

interface PanelProps {
  title?: string;
  /** 주어지면 우상단에 닫기 X를 둔다 (스테이지 모달 카드) */
  onClose?: () => void;
  children: ReactNode;
  className?: string;
}

// 노치+베벨 프레임 박스 — 정비 패널/사이드 카드 등 박스형 콘텐츠 공통 컨테이너
export default function Panel({ title, onClose, children, className }: PanelProps) {
  const modalTitle = useModalTitle();
  useLayoutEffect(() => {
    if (title && modalTitle) modalTitle.register();
  }, [title, modalTitle]);
  return (
    <Frame className={cx('p-2 flex flex-col gap-2', onClose && 'relative', className)}>
      {title && <h3 id={modalTitle?.id} className={cx('pf-accent text-base text-gold', onClose && 'pr-6')}>{title}</h3>}
      {onClose && <CloseButton onClose={onClose} />}
      {children}
    </Frame>
  );
}
