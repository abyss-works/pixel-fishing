import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import { fmtNum } from './format';

export type ProgressCountTone = 'gold' | 'guild' | 'accent' | 'orange' | 'danger' | 'dim';

const CURRENT_TONE: Record<ProgressCountTone, string> = {
  gold: 'text-gold',
  guild: 'text-guild',
  accent: 'text-accent',
  orange: 'text-orange',
  danger: 'text-danger',
  dim: 'text-text-dim',
};

const formatValue = (v: number | string, format: (n: number) => string): string =>
  typeof v === 'number' ? format(v) : v;

export interface ProgressCountProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** 단일 핵심 수치. target이 없을 때 쓴다 */
  value?: number | string;
  /** 진척도의 현재값. null이면 '-'만 보인다 */
  current?: number | string | null;
  /** 진척도의 기준 분모 */
  target?: number | string;
  /** 괄호 안에 함께 보일 백분율 숫자(예: 47 → (47%)) */
  percent?: number | string;
  /** 분모 앞 접두어(예: '요구 ') */
  targetPrefix?: string;
  /** 뒤에 붙일 단위·꼬리표(예: ' 완료', '단계') */
  suffix?: string;
  /** true면 공백 없이 a/b로, false면 a / b로 쓴다 */
  tight?: boolean;
  /** 현재값과 퍼센트의 의미 색. 기본 골드 */
  tone?: ProgressCountTone;
  /** 숫자 포맷터. 기본 천 단위 쉼표(fmtNum) */
  format?: (n: number) => string;
}

// 공용 진척도·핵심 수치 — .pf-accent 서체를 고정하고 현재값·퍼센트는 골드(또는 의미 색),
// 기준 분모(/ b)는 보조색으로 구분한다.
export default function ProgressCount({
  value,
  current,
  target,
  percent,
  targetPrefix = '',
  suffix,
  tight = false,
  tone = 'gold',
  format = fmtNum,
  className,
  ...rest
}: ProgressCountProps) {
  if (target !== undefined) {
    if (current === null || current === undefined) {
      return (
        <span data-progress-count="" data-tone="dim" className={cx('pf-accent', className)} {...rest}>
          <span data-progress-current="" className={CURRENT_TONE.dim}>-</span>
        </span>
      );
    }
    const sep = tight ? '/' : ' / ';
    return (
      <span data-progress-count="" data-tone={tone} className={cx('pf-accent', className)} {...rest}>
        <span data-progress-current="" className={CURRENT_TONE[tone]}>
          {formatValue(current, format)}
        </span>
        <span data-progress-target="" className="text-text-dim">
          {sep}{targetPrefix}{formatValue(target, format)}
        </span>
        {percent !== undefined && (
          <>
            {' '}
            <span data-progress-percent="" className={CURRENT_TONE[tone]}>
              ({percent}%)
            </span>
          </>
        )}
        {suffix !== undefined && <span className="text-text-dim">{suffix}</span>}
      </span>
    );
  }

  const shown = value !== undefined
    ? formatValue(value, format)
    : current !== null && current !== undefined
      ? formatValue(current, format)
      : '-';
  const effectiveTone = value === undefined && (current === null || current === undefined) ? 'dim' : tone;

  return (
    <span data-progress-count="" data-tone={effectiveTone} className={cx('pf-accent', className)} {...rest}>
      <span data-progress-current="" className={CURRENT_TONE[effectiveTone]}>
        {shown}
      </span>
      {suffix !== undefined && <span className="text-text-dim">{suffix}</span>}
    </span>
  );
}
