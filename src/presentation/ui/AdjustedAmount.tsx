import type { Stat } from '../../game/rules/stats';
import { cx } from './cx';
import { fmtGold } from './format';
import Tip, { TipList } from './Tip';

/** 감소는 U+2212(−)로 쓴다 */
const signed = (delta: number): string => `${delta > 0 ? '+' : '−'}${fmtGold(Math.abs(delta))}`;

// 보정 금액 — 보정이 붙는 금액(유물 감소, 길드 보너스 등)을 보이는 유일한 표기다. 보정이 있으면 원본 금액에 취소선을 긋고
// 보정 금액을 옆에 세우며, 툴팁에 `기본 금액`, 사유별 증감, `합계`를 목록으로 싣는다. 보정이 없으면 금액 하나만 보인다.
// 금액과 내역은 규칙 함수가 돌려준 Stat이고, 여기서 값을 다시 계산하지 않는다. 값의 색은 className으로 정한다.
// 취소선은 시각 표현이고 보이는 금액은 aria-hidden이다. 보조 기술에는 화면 밖 텍스트(기본 금액, 증감, 합계)가 읽힌다.
// inButton은 누르면 동작하는 버튼 안의 금액이다. 포커스를 받는 칸과 터치 툴팁을 두지 않고 마우스 호버에서만 툴팁을 연다.
// 키보드와 스크린 리더는 버튼의 접근성 이름에서 같은 내역을 얻는다.
export default function AdjustedAmount({ amount, className, inButton }: { amount: Stat; className?: string; inButton?: boolean }) {
  const mods = amount.mods.filter(mod => mod.delta !== 0);
  if (mods.length === 0) return <span className={cx('pf-accent whitespace-nowrap', className)}>{fmtGold(amount.value)}</span>;
  const rows = [
    { label: '기본 금액', value: fmtGold(amount.base) },
    ...mods.map(mod => ({ label: mod.label, value: signed(mod.delta) })),
    { label: '합계', value: fmtGold(amount.value) },
  ];
  return (
    <Tip text={<TipList rows={rows} />} {...(inButton ? { wraps: true, hoverOnly: true } : {})}>
      <span className="pf-accent whitespace-nowrap inline-flex items-baseline gap-1.5">
        <span className="sr-only">{rows.map(row => `${row.label} ${row.value}`).join(', ')}</span>
        <s aria-hidden="true" className="text-text-dim text-xs">{fmtGold(amount.base)}</s>
        <span aria-hidden="true" className={className}>{fmtGold(amount.value)}</span>
      </span>
    </Tip>
  );
}
