import { cx } from '../../ui/cx';

// Δ 셀 — "이전 행 대비" 변화량 표기. abs와 %를 함께 찍는다(절대값만으로는 스케일이 섞인
// 사다리에서 증가율을 못 읽는다). 상승=골드색, 하랑=danger, 첫 행/계산 불가=faint '—'.
export default function DeltaCell({ prev, cur, digits = 1, suffix = '' }: {
  prev: number | null;
  cur: number;
  /** 소수 자릿수 */
  digits?: number;
  suffix?: string;
}) {
  if (prev === null || !Number.isFinite(prev) || prev === 0) {
    return <span className="text-text-dim">—</span>;
  }
  const diff = cur - prev;
  const pct = diff / Math.abs(prev) * 100;
  const up = diff > 0, down = diff < 0;
  return (
    <span className={cx('pf-accent whitespace-nowrap',
                        up ? 'text-gold' : down ? 'text-danger' : 'text-text-dim')}>
      {up ? '+' : ''}{diff.toFixed(digits)}{suffix}
      <span className="text-2xs text-text-dim ml-1">
        ({up ? '+' : ''}{pct.toFixed(0)}%)
      </span>
    </span>
  );
}
