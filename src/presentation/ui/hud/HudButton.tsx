import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../cx';
import { NOTCH_SM } from '../notch';

// HUD 버튼 — 캔버스 위 입력 줄에 붙는 낮은 노치 버튼(채팅 방 버튼 등). 높이는 HUD 입력 칸과 같은 28px이다.
// active면 베벨을 뒤집고 골드 테두리를 두른다. 글자색은 호출부가 정한다(길드 방이면 길드색).
// 쓸 수 없으면 흐리게 두고 누를 수 없다.
interface HudButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  active?: boolean;
}

export default function HudButton({ active = false, className, ...props }: HudButtonProps) {
  return (
    <button type="button"
            className={cx('inline-flex shrink-0 items-center h-7 px-2.5 text-xs bg-surface-2 border-2', NOTCH_SM,
              'cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed',
              active
                ? 'border-gold shadow-[inset_1px_1px_0_var(--bevel-hi),inset_-1px_-1px_0_var(--bevel-lo)]'
                : 'pf-bevel border-line text-text enabled:hover:border-accent',
              className)}
            {...props} />
  );
}
