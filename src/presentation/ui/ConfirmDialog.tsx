import type { ReactNode } from 'react';
import Button from './Button';
import Modal from './Modal';
import ModalCard from './ModalCard';

// 확인 창 — 되돌리기 어려운 동작 전에 무엇이 바뀌는지 보이고 확정을 받는다.
// 닫기(X·Esc·바깥 클릭)는 취소다. 확정 버튼은 맨 아래 전폭 primary 하나다.
export default function ConfirmDialog({ title, confirmLabel, onConfirm, onCancel, children }: {
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <Modal onClose={onCancel}>
      <ModalCard title={title} onClose={onCancel}
        confirm={<Button variant="primary" full onClick={onConfirm}>{confirmLabel}</Button>}>
        {children}
      </ModalCard>
    </Modal>
  );
}
