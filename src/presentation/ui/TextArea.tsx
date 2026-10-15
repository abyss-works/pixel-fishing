import type { TextareaHTMLAttributes } from 'react';
import { cx } from './cx';

// 여러 줄 입력 — TextInput과 같은 테두리·배경·포커스 규칙. 크기는 호출자가 className으로 정한다.
export default function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx('w-full resize-none bg-bg border border-line rounded-sm text-text text-sm px-3 py-2',
        'outline-none focus:border-accent', className)}
      {...props}
    />
  );
}
