import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';
import { NOTCH_SM } from './notch';

// 토글 칩 — 켜고 끄는 작은 노치 버튼(메시지 창 채널 토글 등). 체크 아이콘 없이 테두리·바탕·글자 대비로만 구분해 폭 변화를 없앤다.
// toggle 변형: 완전 강조(emphasis)는 골드, 일반 켜짐은 선 색 테두리와 본문색, 꺼짐은 투명 테두리와 보조색.
// choice 변형: 정렬 라디오 칩 등 — 비활성에도 테두리·바탕을 유지하고, 활성(emphasis)은 굵은 글씨와 골드로 세운다.
// 칩 안에 덧붙일 표시(새 글 점 등)는 children으로 이름 뒤에 둔다.
interface ToggleChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  pressed: boolean;
  /** 켜져 있을 때 완전 강조로 세운다 */
  emphasis?: boolean;
  size?: 'md' | 'sm';
  variant?: 'toggle' | 'choice';
}

export default function ToggleChip({
  pressed,
  emphasis = false,
  size = 'md',
  variant = 'toggle',
  disabled,
  className,
  children,
  ...props
}: ToggleChipProps) {
  const tier = disabled ? 'off-disabled' : !pressed ? 'off' : emphasis ? 'emphasis' : 'on';
  const isChoice = variant === 'choice';
  return (
    <button type="button" aria-pressed={pressed} disabled={disabled} data-tier={tier}
            className={cx('inline-flex items-center gap-1.5 px-2 text-2xs whitespace-nowrap border transition-colors',
              size === 'sm' ? 'min-h-[24px]' : 'min-h-[26px]',
              !isChoice && 'bg-[color-mix(in_oklab,var(--c-bg)_60%,transparent)]',
              NOTCH_SM,
              tier === 'emphasis' && (isChoice
                ? 'border-gold text-gold font-bold bg-[color-mix(in_oklab,var(--c-gold)_12%,var(--c-surface-2))] cursor-pointer'
                : 'border-gold text-gold bg-[color-mix(in_oklab,var(--c-gold)_10%,var(--c-bg))] cursor-pointer'),
              tier === 'on' && (isChoice
                ? 'border-line text-text font-bold bg-surface-2 cursor-pointer'
                : 'border-line text-text bg-surface-2 cursor-pointer'),
              tier === 'off' && (isChoice
                ? 'border-line text-text-dim bg-surface-2 cursor-pointer hover:border-accent hover:text-text'
                : 'border-transparent text-text-dim cursor-pointer hover:text-text'),
              tier === 'off-disabled' && (isChoice
                ? 'border-line text-text-dim bg-surface-2 opacity-40 cursor-not-allowed'
                : 'border-transparent text-text-dim opacity-40 cursor-not-allowed'),
              className)}
            {...props}>
      {children}
    </button>
  );
}
