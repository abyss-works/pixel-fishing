import PillButton from '../../../ui/PillButton';

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
        <PillButton key={o.key} type="button" active={value === o.key}
                    aria-pressed={value === o.key}
                    onClick={() => onChange(o.key)}>
          {o.label}
        </PillButton>
      ))}
    </div>
  );
}
