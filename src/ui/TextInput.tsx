import type { InputHTMLAttributes } from 'react';
import { cx } from './cx';

// 텍스트/이메일/비밀번호 입력 (구 .account-form input)
export default function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'bg-bg border border-line rounded-sm text-text text-sm px-3 py-2 outline-none focus:border-accent',
        className,
      )}
      {...props}
    />
  );
}
