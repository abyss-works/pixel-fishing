import type { ReactNode } from 'react';
import Button from './Button';
import Modal from './Modal';
import ModalCard from './ModalCard';
import type { WindowLayer } from './openWindows';

// 확인 창 — 되돌리기 어려운 동작 전에 무엇이 바뀌는지 보이고 확정을 받는다.
// 닫기(X·Esc·바깥 클릭)는 취소다. 확정 버튼은 맨 아래 전폭 primary 하나다.
export default function ConfirmDialog({ layer, title, confirmLabel, onConfirm, onCancel, children }: {
  /** 띄울 레이어 — 게임 안 동작의 확인은 stage, 개발 도구 안은 devtools, 그 밖은 app(기본) */
  layer?: WindowLayer;
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const card = (
    <ModalCard title={title} onClose={onCancel}
      confirm={<Button variant="primary" full onClick={onConfirm}>{confirmLabel}</Button>}>
      {children}
    </ModalCard>
  );
  // 앱·개발 도구 레이어는 박스 안에 카드를 직접 둔다(bare) — 스크롤은 카드 본문 한 곳뿐이다
  if (layer === 'stage') return <Modal layer="stage" onClose={onCancel}>{card}</Modal>;
  if (layer === 'devtools') return <Modal layer="devtools" bare onClose={onCancel}>{card}</Modal>;
  return <Modal layer="app" bare onClose={onCancel}>{card}</Modal>;
}
