import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';
import { NOTCH_SM, PRESSED_BEVEL } from './notch';

// 토글 칩 — 켜고 끄는 작은 노치 버튼(메시지 창 채널 토글 등). 강조는 세 단계다.
// 완전 강조(emphasis): 골드 테두리와 골드 글자. 한 묶음에서 가장 중요한 하나에만 준다.
// 일반 켜짐: 선 색 테두리와 본문색 글자, 베벨을 뒤집어 눌린 모양.
// 꺼짐: 테두리 없이 보조색 글자. 쓸 수 없으면 더 흐리게 두고 누를 수 없다.
// 칩 안에 덧붙일 표시(새 글 점 등)는 children으로 이름 뒤에 둔다.
interface ToggleChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  pressed: boolean;
  /** 켜져 있을 때 완전 강조로 세운다 */
  emphasis?: boolean;
}

export default function ToggleChip({ pressed, emphasis = false, disabled, className, children, ...props }: ToggleChipProps) {
  const tier = disabled ? 'off-disabled' : !pressed ? 'off' : emphasis ? 'emphasis' : 'on';
  return (
    <button type="button" aria-pressed={pressed} disabled={disabled} data-tier={tier}
            className={cx('inline-flex items-center gap-1.5 h-[22px] px-2 text-2xs whitespace-nowrap border-2 transition-colors',
              'bg-[color-mix(in_oklab,var(--c-bg)_60%,transparent)]', NOTCH_SM,
              tier === 'emphasis' && cx('border-gold text-gold cursor-pointer', PRESSED_BEVEL),
              tier === 'on' && cx('border-line text-text cursor-pointer', PRESSED_BEVEL),
              tier === 'off' && 'pf-bevel border-transparent text-text-dim cursor-pointer hover:text-text',
              tier === 'off-disabled' && 'border-transparent text-text-dim opacity-40 cursor-not-allowed',
              className)}
            {...props}>
      {children}
    </button>
  );
}
