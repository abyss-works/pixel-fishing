import { cx } from './cx';
import { fmtGold } from './format';

// 가격 표기 — 할인이 있으면 정가에 취소선을 긋고 할인가를 옆에 세운다. 할인이 없으면 가격 하나.
export default function PriceTag({ list, price, size = 'sm' }: { list: number; price: number; size?: 'sm' | 'lg' }) {
  const discounted = price < list;
  return (
    <span className={cx('pf-accent whitespace-nowrap flex items-baseline gap-1.5', size === 'lg' ? 'text-base' : 'text-sm')}>
      {discounted && <s className="text-text-dim text-xs" aria-label={`정가 ${fmtGold(list)}`}>{fmtGold(list)}</s>}
      <span className={discounted ? 'text-gold' : undefined}>{fmtGold(price)}</span>
    </span>
  );
}
