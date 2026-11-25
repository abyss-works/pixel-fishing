import type { ReactNode } from 'react';
import { cx } from './cx';

export type ProgressTone = 'accent' | 'gold' | 'dim' | 'orange' | 'danger' | 'guild';

const FILL: Record<ProgressTone, string> = {
  accent: 'bg-accent',
  gold: 'bg-gold',
  dim: 'bg-text-dim',
  orange: 'bg-orange',
  danger: 'bg-danger',
  guild: 'bg-guild',
};

// 공용 진행 막대 — 1줄(inline)과 2단(stacked: 윗줄 막대 + 아랫줄 수치)을 함께 지원한다.
// 1억 단위 수치와 막대가 한 줄에서 충돌해 막대가 찌그러지지 않도록 긴 수치가 오는 자리에서는 stacked를 쓴다.
// inline에서 rightLabel이 없으면 트랙(<span role="meter">)만 반환해 Tip 래핑 시 DOM 계층을 유지한다.
export default function ProgressMeter({
  current,
  target,
  ratio: ratioProp,
  tone = 'accent',
  stacked = false,
  ariaLabel = '진행',
  leftLabel,
  rightLabel,
  heightClass = 'h-2',
  markerRatio,
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
  heightClass?: string;
  /** 0~1 위치에 세로 골드 목표 눈금을 표시한다 (파워 미터 등) */
  markerRatio?: number;
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
        'relative block border border-line bg-bg',
        heightClass,
        stacked ? 'w-full' : 'flex-1 min-w-0',
        !stacked && rightLabel === undefined && className,
      )}
    >
      <span
        data-achievement-gauge-fill={fillTestAttr === 'achievement' ? '' : undefined}
        className={cx('block h-full', FILL[tone])}
        style={{ width: `${ratio * 100}%` }}
      />
      {markerRatio !== undefined && (
        <span
          className="absolute -top-[3px] -bottom-[3px] w-[2px] bg-gold"
          style={{ left: `calc(${Math.max(0, Math.min(1, markerRatio)) * 100}% - 1px)` }}
        />
      )}
    </span>
  );

  if (stacked) {
    return (
      <div className={cx('flex flex-col gap-1', className)}>
        {track}
        {(leftLabel !== undefined || rightLabel !== undefined) && (
          <div className="flex items-center justify-between gap-2 text-2xs">
            <span>{leftLabel}</span>
            <span className="pf-accent whitespace-nowrap">{rightLabel}</span>
          </div>
        )}
      </div>
    );
  }

  if (rightLabel === undefined) return track;

  return (
    <div className={cx('flex items-center gap-2', className)}>
      {track}
      <span className="pf-accent text-2xs whitespace-nowrap">{rightLabel}</span>
    </div>
  );
}
