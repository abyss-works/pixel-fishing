import { Fragment } from 'react';
import { BONUS_CATEGORIES } from '../../../../features/gameplay/model/stats';
import type { BonusCategory, BonusTableRow } from '../../../../features/gameplay/model/stats';
import { cx } from '../../../ui/cx';
import { useMobileLayout } from '../../../layouts/useMobileLayout';
import Badge from '../../../ui/Badge';
import { HighlightRarityText } from '../../../ui/fish/RarityTag';
import TableBox from '../../../ui/TableBox';
import DataTable from '../../../ui/DataTable';
import Tip, { TipList } from '../../../ui/Tip';

const CATEGORY_LABEL: Record<BonusCategory, string> = { move: '이동', fish: '낚시', duel: '결투', shop: '상점' };
const HEAD = 'h-[30px] font-normal border-b border-line';

// 보너스 탭: 지금 받는 효과를 이동, 낚시, 결투, 상점 갈래로 묶어 동일 효과 단위로 1줄 합산한다.
// 우측 출처 열은 두지 않고 효과 이름, 적용 범위 배지(수동·방치만), 최종 적용 값만 보이며, 세부 [출처] 내역은 툴팁으로 분해한다.
export default function BonusTab({ rows }: { rows: BonusTableRow[] }) {
  const mobile = useMobileLayout();
  const cell = mobile ? 'break-keep' : 'truncate';
  return (
    <TableBox className="flex-1 min-h-0 px-3 pb-2">
      <DataTable cols={mobile ? [null, '32%'] : [null, '120px']} nameMin={mobile ? '0px' : '10rem'} className={mobile ? 'min-w-0!' : undefined}>
        <thead>
          <tr className="sticky top-0 z-1 bg-[color-mix(in_oklab,var(--c-bg)_45%,var(--c-surface))] text-2xs text-text-dim">
            <th className={cx(HEAD, 'text-left')}>받는 효과</th>
            <th className={cx(HEAD, 'text-right')}>적용</th>
          </tr>
        </thead>
        <tbody>
          {BONUS_CATEGORIES.map((category, ci) => {
            const list = rows.filter(row => row.category === category);
            return (
              <Fragment key={category}>
                <tr>
                  <th colSpan={2} scope="colgroup"
                      className={cx('h-[26px] text-left text-2xs font-normal text-text-dim', ci > 0 && 'border-t border-line')}>
                    {CATEGORY_LABEL[category]}
                  </th>
                </tr>
                {list.length > 0 ? list.map(row => (
                  <tr key={row.id}>
                    <td className={cx('h-[34px] border-t border-line/60', cell)}>
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <Tip text={<TipList rows={row.tipRows} />}>
                          <span className="font-medium text-text">
                            <HighlightRarityText text={row.effect} />
                          </span>
                        </Tip>
                        {row.scope === 'manual' && <Badge tone="accent" size="2xs">수동</Badge>}
                        {row.scope === 'auto' && <Badge tone="orange" size="2xs">방치</Badge>}
                      </span>
                    </td>
                    <td className="h-[34px] border-t border-line/60 text-right pf-accent text-gold text-xs whitespace-nowrap">
                      {row.totalText}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={2} className="h-[34px] border-t border-line/60 text-xs text-text-dim">받는 보너스가 없어요.</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </DataTable>
    </TableBox>
  );
}
