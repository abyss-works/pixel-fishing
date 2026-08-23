import { sizePercentile } from '../game/logic';
import type { FishInstance } from '../game/logic';
import type { Fish } from '../data/fish';
import { cx } from '../ui/cx';

// 개체 한 마리의 표시 — 가방 탭과 판매 패널이 같은 줄을 쓴다.
// 개체가 서로 다르다는 걸 유저가 보게 하는 게 목적이라, 종·폼처럼 "같은 것"은 빼고
// **개체마다 다른 것**만 보여준다: 크기 · 잡은 날 · 판정.
const JUDGMENT_LABEL: Record<string, string> = {
  perfect: 'PERFECT',
  auto: '방치',
  normal: '',
};

export interface InstanceLineProps {
  inst: FishInstance;
  fish: Fish;
  /** 이 행에서 가장 큰 개체 — 하나만 표시된다 */
  best?: boolean;
  /** 판매 선택용. 없으면 조회 전용 줄 */
  checked?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
}

export default function InstanceLine({ inst, fish, best, checked, onToggle, children }: InstanceLineProps) {
  // 크기 미상 = 구버전에서 이관된 개체. 추정하지 않고 그대로 밝힌다
  const size = inst.size === null
    ? <span className="text-text-dim">크기 미상</span>
    : <>{inst.size.toFixed(1)}cm{' '}
        <span className="text-text-dim text-[10px]">상위 {sizePercentile(fish, inst.size)}%</span></>;
  const judgment = inst.judgment ? JUDGMENT_LABEL[inst.judgment] : '';
  const day = inst.caughtAt?.slice(0, 10);

  return (
    <div className={cx('flex items-center gap-2 text-[11px] py-0.5 pl-5 pr-1',
                       onToggle && 'cursor-pointer hover:bg-surface-2',
                       checked === false && 'text-text-dim')}
         onClick={onToggle}
         role={onToggle ? 'button' : undefined}>
      {children}
      <span className="min-w-[104px]">{size}</span>
      {best && <span className="text-gold">최대</span>}
      {judgment && <span className="text-accent">{judgment}</span>}
      <span className="ml-auto text-text-dim">{day ?? ''}</span>
    </div>
  );
}
