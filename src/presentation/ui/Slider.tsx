import type { InputHTMLAttributes } from 'react';
import { cx } from './cx';

// 슬라이더 — 범위 안의 정수 하나를 끌어서 고른다. 접근성 이름(aria-label)을 반드시 준다.
export default function Slider({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  'aria-label': string;
}) {
  return <input type="range" className={cx('w-full accent-gold cursor-pointer', className)} {...props} />;
}
