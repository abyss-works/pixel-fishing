import type { ReactNode } from 'react';
import { cx } from './cx';
import { fmtGold, fmtNum } from './format';

// 잔액 줄 — 확정 전에 "보유 → 확정 후"를 이름 왼쪽, 값 오른쪽의 한 줄로 보인다. delta가 음수면 지출, 양수면 수입.
// 재화가 골드가 아니면(교환 재료 등) label과 format으로 이름과 값 표기를 바꾼다.
// 모자라면 확정 후 값을 위험색으로 칠한다(버튼 비활성과 같은 신호). 명성처럼 차감 없는
// 조건은 requirement로 아래 줄에 `보유 / 필요`를 붙인다. 변화량은 확정 버튼이 보이므로 여기서 다시 쓰지 않는다.
export default function CostLine({ have, delta, label = '골드', format = fmtGold, requirement, className }: {
  have: number;
  delta: number;
  /** 재화 이름 - 기본 골드. 규칙 설명 툴팁을 달 수 있다 */
  label?: ReactNode;
  /** 값 표기 - 기본 골드(500G) */
  format?: (n: number) => string;
  /** 차감 없는 하한 조건 (예: 명성). label에 규칙 설명 툴팁을 달 수 있다 */
  requirement?: { label: ReactNode; need: number; have: number };
  className?: string;
}) {
  const after = have + delta;
  const short = after < 0;
  const reqShort = requirement ? requirement.have < requirement.need : false;
  return (
    <div className={cx('text-sm flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-text-dim">{label}</span>
        <span className="pf-accent text-xs flex items-baseline gap-1.5">
          <span>{format(have)}</span>
          <span className="text-text-dim">→</span>
          <span className={cx(short && 'text-danger')}>{format(after)}</span>
        </span>
      </div>
      {requirement && (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-text-dim">{requirement.label}</span>
          <span className="pf-accent text-xs flex items-baseline gap-1.5">
            <span className={cx(reqShort && 'text-danger')}>{fmtNum(requirement.have)}</span>
            <span className="text-text-dim">/</span>
            <span className="text-text-dim">{fmtNum(requirement.need)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
