import type { InputHTMLAttributes } from 'react';
import { cx } from './cx';
import { fieldClass } from './fieldStyle';

// 텍스트/이메일/비밀번호 입력 (구 .account-form input)
// compact = 표 셀용 소형 (어드민 시뮬레이션 오버라이드 입력)
export default function TextInput({ compact, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { compact?: boolean }) {
  return (
    <input
      className={cx(fieldClass(compact), className)}
      {...props}
    />
  );
}
