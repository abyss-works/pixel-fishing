import { cx } from '../cx';
import type { BagLevel } from '../../../features/inventory/model/selectors';

// 가방 게이지와 채움 백분율 - 헤더 자원 바의 가방 칸 값 자리. 두 레이아웃이 함께 쓰고, 크기는 호출부가 className으로 정한다.
// 채울수록 주황(75% 이상), 빨강 계열(95% 이상)로 바뀌어 팔 때를 알린다. 수량은 칸의 툴팁과 스탯 창에서 본다.
const FILL: Record<BagLevel, string> = { normal: 'bg-gold', warn: 'bg-orange', danger: 'bg-danger' };
const TEXT: Record<BagLevel, string> = { normal: 'text-gold', warn: 'text-orange', danger: 'text-danger' };

export default function BagMeter({ percent, level, gaugeClass, percentClass }: {
  percent: number;
  level: BagLevel;
  /** 게이지의 폭과 높이 */
  gaugeClass: string;
  /** 백분율의 글자 크기와 자리 */
  percentClass: string;
}) {
  return (
    <>
      <span data-gauge className={cx('block shrink-0 bg-bg border border-line', gaugeClass)}>
        <span className={cx('block h-full', FILL[level])} style={{ width: `${Math.min(100, percent)}%` }} />
      </span>
      <b data-percent className={cx('pf-accent font-bold leading-none whitespace-nowrap text-right', TEXT[level], percentClass)}>{percent}%</b>
    </>
  );
}
