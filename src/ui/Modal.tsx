import type { ReactNode } from 'react';
import { cx } from './cx';

interface ModalProps {
  /** app = 화면 전체(fixed) 박스형 모달(계정/도감 상세/관리자) ·
      stage = 게임 스테이지 안(absolute) 투명 컨테이너(정비 — 내용이 직접 Panel 프레임을 가진다) */
  layer?: 'app' | 'stage';
  title?: string;
  /** app 전용 — 데이터량이 큰 모달(관리자 대시보드) 확폭 */
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

// 공통 모달 — 백드롭 클릭으로 닫히고, 내용 클릭은 전파를 막는다
export default function Modal({ layer = 'app', title, wide, onClose, children, className }: ModalProps) {
  const backdrop = layer === 'app'
    ? 'fixed inset-0 z-(--z-app-modal) bg-[rgba(4,9,18,0.7)]'
    : 'absolute inset-0 z-(--z-stage-modal) bg-[rgba(4,9,18,0.6)]';
  const box = layer === 'app'
    ? cx('bg-surface border border-line rounded-md shadow-panel p-4 max-w-[90vw] max-h-[80vh] overflow-y-auto',
        wide ? 'w-[560px]' : 'w-[480px]')
    : 'w-[min(400px,calc(100%-32px))] max-h-[calc(100%-32px)] overflow-y-auto';
  return (
    <div className={cx(backdrop, 'flex items-center justify-center animate-fade-in')} onClick={onClose}>
      <div className={cx(box, className)} onClick={e => e.stopPropagation()}>
        {title && <h3 className="text-base text-gold mb-2">{title}</h3>}
        {children}
      </div>
    </div>
  );
}
