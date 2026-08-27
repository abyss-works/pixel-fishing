import { cx } from './cx';

type Variant = 'inline' | 'side';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  variant?: Variant;
  ariaLabel?: string;
  className?: string;
}

// 숫자 스테퍼 — 여기저기 쓰일 소모품 수량·스탯 입력의 공용 껍데기.
// variant 두 가지:
//  - inline: 현재 미끼 상점 버전 — [−] [값] [+] 이 한 줄의 테두리 박스에 들어간다
//  - side: 우측에 +-를 모은 버전 — [값] [−][+] 가 오른쪽에 붙는다 (폼에서 쓰기 좋다)
export default function NumberStepper({
  value,
  onChange,
  min = 1,
  max = 50,
  step = 1,
  disabled = false,
  variant = 'inline',
  ariaLabel,
  className,
}: Props) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.floor(n) || min));
  const dec = () => { if (!disabled && value > min) onChange(clamp(value - step)); };
  const inc = () => { if (!disabled && value < max) onChange(clamp(value + step)); };

  const btnBase = 'px-1.5 py-1 text-xs leading-none text-text-dim hover:text-text disabled:opacity-40 cursor-pointer bg-transparent border-0';

  if (variant === 'side') {
    return (
      <span className={cx('inline-flex items-center gap-1.5', className)}>
        <span className="min-w-8 text-center text-xs pf-accent text-text leading-none py-1.5 px-2 rounded-sm border border-line bg-bg">
          {value}
        </span>
        <span className="inline-flex overflow-hidden rounded-sm border border-line bg-bg">
          <button
            type="button"
            aria-label={ariaLabel ? `${ariaLabel} 수량 감소` : '수량 감소'}
            disabled={disabled || value <= min}
            onClick={dec}
            className={cx(btnBase, 'border-r border-line')}
          >
            −
          </button>
          <button
            type="button"
            aria-label={ariaLabel ? `${ariaLabel} 수량 증가` : '수량 증가'}
            disabled={disabled || value >= max}
            onClick={inc}
            className={btnBase}
          >
            +
          </button>
        </span>
      </span>
    );
  }

  // inline — [−] [값] [+] 한 박스
  return (
    <span className={cx('inline-flex items-center overflow-hidden rounded-sm border border-line bg-bg', className)}>
      <button
        type="button"
        aria-label={ariaLabel ? `${ariaLabel} 수량 감소` : '수량 감소'}
        disabled={disabled || value <= min}
        onClick={dec}
        className={btnBase}
      >
        −
      </button>
      <span className="w-7 text-center text-xs pf-accent text-text leading-none py-1 border-x border-line">
        {value}
      </span>
      <button
        type="button"
        aria-label={ariaLabel ? `${ariaLabel} 수량 증가` : '수량 증가'}
        disabled={disabled || value >= max}
        onClick={inc}
        className={btnBase}
      >
        +
      </button>
    </span>
  );
}
