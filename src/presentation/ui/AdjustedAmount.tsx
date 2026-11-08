import type { Stat } from '../../game/rules/stats';
import { cx } from './cx';
import { fmtGold } from './format';
import Tip, { TipList } from './Tip';

const signed = (delta: number): string => `${delta > 0 ? '+' : '-'}${fmtGold(Math.abs(delta))}`;

// 보정 금액 — 보정이 붙는 금액(유물 감소, 길드 보너스 등)을 보이는 유일한 표기다. 보정이 있으면 원본 금액에 취소선을 긋고
// 보정 금액을 옆에 세우며, 툴팁에 `기본 금액`, 사유별 증감, `합계`를 목록으로 싣는다. 보정이 없으면 금액 하나만 보인다.
// 금액과 내역은 규칙 함수가 돌려준 Stat이고, 여기서 값을 다시 계산하지 않는다. 값의 색은 className으로 정한다.
export default function AdjustedAmount({ amount, className }: { amount: Stat; className?: string }) {
  const mods = amount.mods.filter(mod => mod.delta !== 0);
  if (mods.length === 0) return <span className={cx('pf-accent whitespace-nowrap', className)}>{fmtGold(amount.value)}</span>;
  return (
    <Tip text={
      <TipList rows={[
        { label: '기본 금액', value: fmtGold(amount.base) },
        ...mods.map(mod => ({ label: mod.label, value: signed(mod.delta) })),
        { label: '합계', value: fmtGold(amount.value) },
      ]} />
    }>
      <span className="pf-accent whitespace-nowrap inline-flex items-baseline gap-1.5">
        <s className="text-text-dim text-xs" aria-label={`기본 금액 ${fmtGold(amount.base)}`}>{fmtGold(amount.base)}</s>
        <span className={className}>{fmtGold(amount.value)}</span>
      </span>
    </Tip>
  );
}
