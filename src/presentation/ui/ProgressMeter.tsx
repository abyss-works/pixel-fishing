import type { ReactNode } from 'react';
import { cx } from './cx';

export type ProgressTone = 'accent' | 'gold' | 'dim';

const FILL: Record<ProgressTone, string> = {
  accent: 'bg-accent',
  gold: 'bg-gold',
  dim: 'bg-text-dim',
};

// 공용 진행 막대 — 1줄(inline)과 2단(stacked: 윗줄 막대 + 아랫줄 수치)을 함께 지원한다.
// 1억 단위 수치와 막대가 한 줄에서 충돌해 막대가 찌그러지지 않도록 긴 수치가 오는 자리에서는 stacked를 쓴다.
export default function ProgressMeter({
  current,
  target,
  ratio: ratioProp,
  tone = 'accent',
  stacked = false,
  ariaLabel = '진행',
  leftLabel,
  rightLabel,
  className,
  fillTestAttr,
}: {
  current: number;
  target: number;
  ratio?: number;
  tone?: ProgressTone;
  stacked?: boolean;
  ariaLabel?: string;
  leftLabel?: ReactNode;
  rightLabel?: ReactNode;
  className?: string;
  /** 테스트 등에서 채움 요소를 집을 때 쓰는 data 속성 값 */
  fillTestAttr?: 'achievement';
}) {
  const safeMax = Math.max(target, 1);
  const clamped = Math.min(Math.max(current, 0), target);
  const ratio = ratioProp !== undefined
    ? Math.max(0, Math.min(1, ratioProp))
    : target > 0 ? clamped / target : 0;

  const track = (
    <span
      role="meter"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.min(Math.max(current, 0), safeMax)}
      className={cx(
        'block h-2 border border-line bg-bg shadow-[inset_1px_1px_0_var(--bevel-hi)]',
        stacked ? 'w-full' : 'flex-1 min-w-0',
      )}
    >
      <span
        data-achievement-gauge-fill={fillTestAttr === 'achievement' ? '' : undefined}
        className={cx('block h-full shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]', FILL[tone])}
        style={{ width: `${ratio * 100}%` }}
      />
    </span>
  );

  if (stacked) {
    return (
      <div className={cx('flex flex-col gap-1', className)}>
        {track}
        {(leftLabel !== undefined || rightLabel !== undefined) && (
          <div className="flex items-center justify-between gap-2 text-2xs">
            <span>{leftLabel}</span>
            <span className="whitespace-nowrap">{rightLabel}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cx('flex items-center gap-2', className)}>
      {track}
      {rightLabel !== undefined && <span className="pf-accent text-2xs whitespace-nowrap">{rightLabel}</span>}
    </div>
  );
}
