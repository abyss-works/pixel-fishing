import { cx } from '../../../ui/cx';
import ProgressCount from '../../../ui/ProgressCount';
import ProgressMeter from '../../../ui/ProgressMeter';

// 파워 막대: 채움이 현재 파워, 금색 눈금이 해역의 요구 파워다. 막대 끝은 둘 중 큰 값이다.
// 요구에 못 미치면 위험색으로 채운다. 오른쪽에 `파워 / 요구 n`을 적는다.
export default function PowerMeter({ power, requirement, className }: { power: number; requirement: number; className?: string }) {
  const top = Math.max(power, requirement, 1);
  const short = power < requirement;
  return (
    <div className={cx('flex items-center gap-2.5 text-xs', className)}>
      <span className="text-text-dim shrink-0">파워</span>
      <ProgressMeter
        current={power}
        target={top}
        tone={short ? 'danger' : 'accent'}
        heightClass="h-2"
        markerRatio={requirement / top}
        ariaLabel="파워"
      />
      <ProgressCount
        current={power}
        target={requirement}
        targetPrefix="요구 "
        tone={short ? 'danger' : 'gold'}
        className="shrink-0"
      />
    </div>
  );
}
