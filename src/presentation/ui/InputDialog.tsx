import { useState } from 'react';
import type { ReactNode } from 'react';
import Button from './Button';
import Modal from './Modal';
import ModalCard from './ModalCard';
import TextArea from './TextArea';
import TextInput from './TextInput';

// 입력 창 — 긴 값(코드 등)을 붙여넣어 받는다. 닫기(X·Esc·바깥 클릭)는 취소다.
// 빈 값이면 확정 버튼이 잠긴다. secret이면 한 줄 비밀번호 칸으로 받는다.
export default function InputDialog({ title, body, label, placeholder, secret, confirmLabel, onSubmit, onCancel }: {
  title: string;
  body?: ReactNode;
  /** 입력칸의 접근성 이름 */
  label: string;
  placeholder?: string;
  /** 입력 내용을 가린다(비밀번호) */
  secret?: boolean;
  confirmLabel: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <Modal onClose={onCancel}>
      <ModalCard title={title} onClose={onCancel}
        confirm={<Button variant="primary" full disabled={!value.trim()} onClick={() => onSubmit(value)}>{confirmLabel}</Button>}>
        {body && <div className="text-sm leading-relaxed whitespace-pre-line">{body}</div>}
        {secret
          ? <TextInput type="password" autoComplete="new-password" aria-label={label} placeholder={placeholder} value={value}
                       onChange={e => setValue(e.target.value)} autoFocus />
          : <TextArea rows={4} aria-label={label} placeholder={placeholder} value={value}
                      onChange={e => setValue(e.target.value)} autoFocus />}
      </ModalCard>
    </Modal>
  );
}
