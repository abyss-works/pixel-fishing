import { cx } from '../../../ui/cx';

// 파워 막대: 채움이 현재 파워, 금색 눈금이 해역의 요구 파워다. 막대 끝은 둘 중 큰 값이다.
// 요구에 못 미치면 위험색으로 채운다. 오른쪽에 `파워 / 요구 n`을 적는다.
export default function PowerMeter({ power, requirement, className }: { power: number; requirement: number; className?: string }) {
  const top = Math.max(power, requirement, 1);
  const short = power < requirement;
  return (
    <div className={cx('flex items-center gap-2.5 text-xs', className)}
         role="meter" aria-label="파워" aria-valuemin={0} aria-valuemax={top} aria-valuenow={power}
         aria-valuetext={`파워 ${power}, 요구 ${requirement}`}>
      <span className="text-text-dim shrink-0">파워</span>
      <span className="relative flex-1 h-2 bg-bg border border-line shadow-[inset_1px_1px_0_var(--bevel-hi)]">
        <span className={cx('absolute inset-y-0 left-0', short ? 'bg-danger' : 'bg-accent')}
              style={{ width: `${(power / top) * 100}%` }} />
        <span className="absolute -top-[3px] -bottom-[3px] w-[2px] bg-gold"
              style={{ left: `calc(${(requirement / top) * 100}% - 1px)` }} />
      </span>
      <span className="pf-accent shrink-0">
        <span className={cx(short && 'text-danger')}>{power}</span> <span className="text-text-dim">/ 요구 {requirement}</span>
      </span>
    </div>
  );
}
