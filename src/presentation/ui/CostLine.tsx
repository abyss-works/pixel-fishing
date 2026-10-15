import { cx } from './cx';
import { fmtGold, fmtNum } from './format';

// 잔액 줄 — 확정 전에 "보유 → 확정 후"를 한 줄로 보여준다. delta가 음수면 지출, 양수면 수입.
// 모자라면 확정 후 값을 위험색으로 칠한다(버튼 비활성과 같은 신호). 명성처럼 차감 없는
// 조건은 requirement로 아래 줄에 붙인다 — 네 패널이 네 가지로 적던 보유·비용 표기의 단일 형태.
export default function CostLine({ have, delta, requirement, className }: {
  have: number;
  delta: number;
  /** 차감 없는 하한 조건 (예: 명성) */
  requirement?: { label: string; need: number; have: number };
  className?: string;
}) {
  const after = have + delta;
  const short = after < 0;
  const reqShort = requirement ? requirement.have < requirement.need : false;
  return (
    <div className={cx('text-sm flex flex-col gap-0.5', className)}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-text-dim">보유</span>
        <span className="pf-accent">{fmtGold(have)}</span>
        <span className="text-text-dim">→</span>
        <span className={cx('pf-accent', short ? 'text-danger' : 'text-gold')}>{fmtGold(after)}</span>
        <span className="pf-accent text-text-dim text-xs">
          ({delta < 0 ? '-' : '+'}{fmtGold(Math.abs(delta))})
        </span>
      </div>
      {requirement && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-text-dim">{requirement.label}</span>
          <span className={cx('pf-accent', reqShort && 'text-danger')}>{fmtNum(requirement.have)}</span>
          <span className="text-text-dim">/ 필요</span>
          <span className="pf-accent">{fmtNum(requirement.need)}</span>
          <span className="text-text-dim text-xs">소모 없음</span>
        </div>
      )}
    </div>
  );
}
