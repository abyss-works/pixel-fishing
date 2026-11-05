import type { ReactNode } from 'react';
import Button from '../../../ui/Button';
import DataTable from '../../../ui/DataTable';
import Inset from '../../../ui/Inset';
import Tip from '../../../ui/Tip';

// 목록형 시설(낚싯대 강화, 조선소, 상점)의 오른쪽 상세 열이 함께 쓰는 조각.

export interface CompareRow {
  label: ReactNode;
  /** 현재 값. 비교할 현재 값이 없으면 비운다 */
  value?: ReactNode;
  next: ReactNode;
  /** 변화량(예: "+15", "-0.4초") */
  delta?: string;
}

/** 현재와 확정 후 비교 표 — 이름, 현재, 확정 후 세 열. 열 머리와 이름에 규칙 설명 툴팁을 달 수 있다 */
export function CompareTable({ heads, rows }: { heads: [ReactNode, ReactNode]; rows: CompareRow[] }) {
  return (
    <Inset className="px-3 pt-1 pb-2">
      <DataTable className="table-fixed [&_th]:h-[30px] [&_th]:text-2xs [&_th]:text-right [&_td]:h-7 [&_td]:text-right
                            [&_td]:whitespace-nowrap [&_td]:border-b-0 [&_tbody_tr+tr_td]:border-t [&_tbody_tr+tr_td]:border-line/60
                            [&_th:first-child]:text-left [&_td:first-child]:text-left [&_th:first-child]:pl-0 [&_td:first-child]:pl-0
                            [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
        <colgroup><col /><col className="w-28" /><col className="w-36" /></colgroup>
        <thead><tr><th aria-label="항목" /><th>{heads[0]}</th><th>{heads[1]}</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="text-text-dim">{r.label}</td>
              <td className="pf-accent text-xs text-text-dim">{r.value}</td>
              <td className="pf-accent text-xs text-accent">
                {r.next}
                {r.delta && <span className="ml-1.5 text-2xs">{r.delta}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Inset>
  );
}

/** 확정 버튼 — 상세 열 맨 아래 전폭. 누를 수 없는 이유가 있으면 버튼의 툴팁으로 보인다 */
export function ConfirmButton({ reason, disabled, onClick, children }: {
  reason: string | null; disabled: boolean; onClick: () => void; children: ReactNode;
}) {
  const button = <Button variant="primary" full disabled={disabled} onClick={onClick}>{children}</Button>;
  return reason ? <Tip wraps text={reason} className="block">{button}</Tip> : button;
}
