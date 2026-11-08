import type { ReactNode } from 'react';
import { useMobileLayout } from '../../../layouts/useMobileLayout';
import Button from '../../../ui/Button';
import DataTable from '../../../ui/DataTable';
import TableBox from '../../../ui/TableBox';
import Tip from '../../../ui/Tip';

// 목록형 시설(낚싯대 강화, 조선소, 상점)의 오른쪽 상세 열이 함께 쓰는 조각.

export interface CompareRow {
  label: ReactNode;
  /** 현재 값. 비교할 현재 값이 없으면 비운다 */
  value?: ReactNode;
  /** 확정 후 값. 현재 열만 보이는 표(heads가 하나)에서는 쓰지 않는다 */
  next?: ReactNode;
  /** 변화량(예: "+15", "-0.4초") */
  delta?: string;
}

/** 현재와 확정 후 비교 표 — 이름, 현재, 확정 후 세 열. 열 머리와 이름에 규칙 설명 툴팁을 달 수 있다.
 *  값 열 폭은 PC 레이아웃에서 7rem, 9rem으로 고정이고 모바일 레이아웃에서는 칸 폭의 비율이라 좁은 창에도 가로 스크롤 없이 들어간다.
 *  이름이 길면 이름 칸에서 줄을 바꾼다. heads가 하나면 확정 후 열 없이 현재 열만 보인다(더 바꿀 수 없는 최고 단계). */
export function CompareTable({ heads, rows }: { heads: [ReactNode] | [ReactNode, ReactNode]; rows: CompareRow[] }) {
  const showNext = heads.length > 1;
  const mobile = useMobileLayout();
  const cols = mobile ? [null, '28%', '36%'] : [null, '7rem', '9rem'];
  return (
    <TableBox className="shrink-0 px-3 pt-1 pb-2">
      <DataTable cols={showNext ? cols : cols.slice(0, 2)} nameMin={mobile ? '0px' : '6rem'}
                 className={`pf-table [&_th]:h-[30px] [&_th]:text-2xs [&_th]:text-right [&_td]:h-7 [&_td]:text-right
                            [&_td]:whitespace-nowrap [&_td]:border-b-0 [&_tbody_tr+tr_td]:border-t [&_tbody_tr+tr_td]:border-line/60
                            [&_th:first-child]:text-left [&_td:first-child]:text-left [&_th:first-child]:pl-0 [&_td:first-child]:pl-0
                            [&_th:last-child]:pr-0 [&_td:last-child]:pr-0 ${mobile ? '[&_td:first-child]:whitespace-normal' : ''}`}>
        <thead><tr><th aria-label="항목" /><th>{heads[0]}</th>{showNext && <th>{heads[1]}</th>}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="text-text-dim">{r.label}</td>
              <td className="pf-accent text-xs text-text-dim">{r.value}</td>
              {showNext && (
                <td className="pf-accent text-xs text-accent">
                  {r.next}
                  {r.delta && <span className="ml-1.5 text-2xs">{r.delta}</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </DataTable>
    </TableBox>
  );
}

/** 확정 버튼 — 카드의 확정 자리(confirm)에 두는 전폭 버튼. 누를 수 없는 이유가 있으면 버튼의 툴팁으로 보인다 */
export function ConfirmButton({ reason, disabled, onClick, children }: {
  reason: string | null; disabled: boolean; onClick: () => void; children: ReactNode;
}) {
  const button = <Button variant="primary" full disabled={disabled} onClick={onClick}>{children}</Button>;
  return reason ? <Tip wraps text={reason} className="block">{button}</Tip> : button;
}
