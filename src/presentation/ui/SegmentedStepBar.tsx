import { cx } from './cx';

export interface StepSegment {
  id: string;
  state: 'done' | 'now' | 'open' | 'claimable';
  /** now 상태일 때 0~100 비율 */
  pct?: number;
}

// 공용 다단계 분절 진행 막대 — 누적 보너스·네임드 다회 토벌처럼 단계가 나뉜 진행도를 단일 meter로 그린다.
export default function SegmentedStepBar({
  steps,
  ariaLabel,
  valueNow,
  valueMax,
  className,
  fillTestAttr,
}: {
  steps: readonly StepSegment[];
  ariaLabel: string;
  valueNow: number;
  valueMax: number;
  className?: string;
  fillTestAttr?: 'achievement';
}) {
  const safeMax = Math.max(valueMax, 1);
  return (
    <div
      role="meter"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.min(Math.max(valueNow, 0), safeMax)}
      className={cx('grid gap-1', className)}
      style={{ gridTemplateColumns: `repeat(${Math.max(steps.length, 1)}, minmax(0, 1fr))` }}
    >
      {steps.map(step => (
        <span
          key={step.id}
          className={cx(
            'block h-2 overflow-hidden border bg-bg shadow-[inset_1px_1px_0_var(--bevel-hi)]',
            step.state === 'claimable' ? 'border-gold' : 'border-line',
          )}
        >
          {(step.state === 'done' || step.state === 'claimable') && (
            <span
              data-achievement-gauge-fill={fillTestAttr === 'achievement' ? '' : undefined}
              className="block h-full w-full bg-gold"
            />
          )}
          {step.state === 'now' && (
            <span
              data-achievement-gauge-fill={fillTestAttr === 'achievement' ? '' : undefined}
              className="block h-full bg-accent"
              style={{ width: `${Math.max(0, Math.min(100, step.pct ?? 0))}%` }}
            />
          )}
        </span>
      ))}
    </div>
  );
}
