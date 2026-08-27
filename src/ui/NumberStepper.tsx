import { useEffect, useRef, useState } from 'react';
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
// 값은 버튼뿐 아니라 **직접 타이핑**으로도 바꾼다(사용자 지시: "숫자 입력할 수 있게").
//   - 편집 중엔 로컬 draft를 보여준다 — 미완성 숫자("2"→"25" 타이핑 도중)가 clamp에
//     짓눌리지 않게. 유효한 정수가 완성될 때마다 onChange로 즉시 반영해 부모의 총액 계산이 산다.
//   - blur/Enter에서 draft를 확정한다 — 비숫자·공란은 직전 값으로 되돌린다(min 클램프 아님:
//     실수로 "0"을 치면 1로 조용히 고쳐주는 편이 예측 가능).
// variant 두 가지:
//  - inline: [−] [값] [+] 이 한 줄의 테두리 박스 (미끼 상점)
//  - side:   우측에 +-를 모은 버전 — [값] [−][+] (폼에서 쓰기 좋다)
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

  // draft = null이면 "비편집" — 표시는 prop value. 문자열 편집 중엔 draft가 이긴다.
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 외부에서 value가 바뀌고(버튼 등) 우리가 편집 중이 아니면 input 표시도 따라간다
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(null);
  }, [value]);

  const commit = () => {
    if (draft === null) return;
    const n = /^\d+$/.test(draft.trim()) ? parseInt(draft.trim(), 10) : NaN;
    if (Number.isFinite(n)) onChange(clamp(n)); // 빈칸·문자 섞임 → 원복(변경 없음)
    setDraft(null);
  };

  const onInput = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, '').slice(0, String(max).length + 1); // 숫자만, 과입력 방지
    setDraft(digits);
    if (/^\d+$/.test(digits)) {
      const n = parseInt(digits, 10);
      if (n >= min && n <= max) onChange(n); // 유효 범위만 즉시 반영 — 부모 총액이 살아 있는다
    }
  };

  const btnBase = 'px-1.5 py-1 text-xs leading-none text-text-dim hover:text-text disabled:opacity-40 cursor-pointer bg-transparent border-0';
  const inputBase = 'text-center text-xs pf-accent text-text leading-none py-1 bg-transparent border-0 outline-none w-full select-text';

  const input = (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={ariaLabel ? `${ariaLabel} 수량` : '수량'}
      disabled={disabled}
      value={draft ?? String(value)}
      onChange={e => onInput(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { commit(); inputRef.current?.blur(); } }}
      className={cx(inputBase)}
    />
  );

  if (variant === 'side') {
    return (
      <span className={cx('inline-flex items-center gap-1.5', className)}>
        <span className="min-w-8 py-1.5 px-2 rounded-sm border border-line bg-bg">
          {input}
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
      <span className="w-9 border-x border-line py-1 flex justify-center">
        {input}
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
