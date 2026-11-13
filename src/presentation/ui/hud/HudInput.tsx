import type { ComponentProps } from 'react';
import { cx } from '../cx';
import { NOTCH_SM } from '../notch';

// HUD 입력 칸 — 캔버스 위 입력 줄의 오목한 노치 칸(채팅 입력 등). 높이 28px, 포커스를 받으면 골드 테두리다.
// 쓸 수 없는 입력 칸은 공용 잠금 요소(Locked)로 감싼다.
const BOX = cx('h-7 min-w-0 flex-1 flex items-center px-2 text-xs border-2 border-line', NOTCH_SM,
  'bg-[color-mix(in_oklab,var(--c-bg)_80%,transparent)] shadow-[inset_2px_2px_0_var(--bevel-hi)]');

export default function HudInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input className={cx(BOX, 'text-text placeholder:text-text-dim outline-none focus:border-gold', className)}
           {...props} />
  );
}
