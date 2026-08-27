import { cx } from '../../ui/cx';

// 세그먼트 스위치 — 값 그룹 중 하나를 고르는 소형 컨트롤(메트릭 골드/명성 전환 등).
// select가 아니라 버튼 그룹인 이유: 모든 후보가 상시 보여야 "지금 어느 축을 보는가"가 눈에 남는다.
export default function MetricSwitch<T extends string>({ value, options, onChange, ariaLabel }: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="flex gap-1" role="group" aria-label={ariaLabel}>
      {options.map(o => (
        <button key={o.key} type="button"
                aria-pressed={value === o.key}
                onClick={() => onChange(o.key)}
                className={cx('border rounded-sm px-2.5 py-1 text-xs cursor-pointer transition',
                              value === o.key
                                ? 'border-gold text-gold bg-surface-2 pf-accent'
                                : 'border-line text-text-dim hover:text-text hover:border-text-dim')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
