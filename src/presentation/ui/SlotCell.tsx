import type { ReactNode } from 'react';
import { cx } from './cx';
import Frame from './Frame';

// 칸 버튼 — 격자에 놓는 고르는 칸(프리셋, 색, 모자). 모양은 상태를 나타낸다.
// raised = 볼록한 기본 칸, sunken = 오목하고 흐린 칸(아직 갖지 못한 것), pressed = 눌리고 골드 테두리(지금 쓰는 것).
// picked는 지금 고른 칸으로, 하늘색 테두리를 더한다. 칸 크기와 안쪽 배치는 호출부가 정한다.
const FORM = {
  raised: 'bg-surface-2',
  sunken: 'bg-bg text-text-dim border-line-dim shadow-[inset_1px_1px_0_var(--bevel-hi),inset_-1px_-1px_0_var(--bevel-lo)]',
  pressed: 'bg-surface-2 translate-y-px shadow-[inset_-1px_-1px_0_var(--bevel-lo),inset_1px_1px_0_var(--bevel-hi)]',
} as const;

export default function SlotCell({
  form = 'raised', tone = 'gold', picked, disabled, ariaDisabled, ariaPressed, role, onSelect, ariaLabel, className, children,
}: {
  form?: keyof typeof FORM;
  tone?: 'gold' | 'guild';
  picked?: boolean;
  disabled?: boolean;
  ariaDisabled?: boolean;
  ariaPressed?: boolean;
  role?: 'radio';
  onSelect: () => void;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const checkedProps = role === 'radio'
    ? { role: 'radio' as const, 'aria-checked': form === 'pressed' || !!picked }
    : { 'aria-pressed': ariaPressed ?? picked ?? false };
  return (
    <Frame as="button" type="button" disabled={disabled} aria-disabled={ariaDisabled || undefined}
           aria-label={ariaLabel} {...checkedProps}
           onClick={disabled || ariaDisabled ? undefined : onSelect}
           className={cx(disabled || ariaDisabled ? 'cursor-default' : 'cursor-pointer',
             FORM[form], form === 'pressed' && (tone === 'guild' ? 'border-epic' : 'border-gold'), picked && 'border-accent', className)}>
      {children}
    </Frame>
  );
}
