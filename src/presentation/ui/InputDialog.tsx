import { useState } from 'react';
import type { ReactNode } from 'react';
import Button from './Button';
import Modal from './Modal';
import ModalCard from './ModalCard';
import TextArea from './TextArea';
import type { WindowLayer } from './openWindows';

// 입력 창 — 긴 값(코드 등)을 붙여넣어 받는다. 닫기(X·Esc·바깥 클릭)는 취소다.
// 빈 값이면 확정 버튼이 잠긴다.
export default function InputDialog({ layer = 'app', title, body, label, placeholder, confirmLabel, onSubmit, onCancel }: {
  /** 띄울 레이어 — 게임 안 입력 창은 stage, 개발 도구 안은 devtools, 그 밖은 app(기본) */
  layer?: WindowLayer;
  title: string;
  body?: ReactNode;
  /** 입력칸의 접근성 이름 */
  label: string;
  placeholder?: string;
  confirmLabel: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const card = (
    <ModalCard title={title} onClose={onCancel}
      confirm={<Button variant="primary" full disabled={!value.trim()} onClick={() => onSubmit(value)}>{confirmLabel}</Button>}>
      {body && <div className="text-sm leading-relaxed whitespace-pre-line">{body}</div>}
      <TextArea rows={4} aria-label={label} placeholder={placeholder} value={value}
                onChange={e => setValue(e.target.value)} autoFocus />
    </ModalCard>
  );
  if (layer === 'stage') return <Modal layer="stage" onClose={onCancel}>{card}</Modal>;
  if (layer === 'devtools') return <Modal layer="devtools" bare onClose={onCancel}>{card}</Modal>;
  return <Modal layer="app" bare onClose={onCancel}>{card}</Modal>;
}
