import type { TextareaHTMLAttributes } from 'react';
import { cx } from './cx';
import { fieldClass } from './fieldStyle';

// 여러 줄 입력 — TextInput과 같은 테두리·배경·포커스 규칙. 크기는 호출자가 className으로 정한다.
export default function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(fieldClass(), 'w-full resize-none', className)}
      {...props}
    />
  );
}
