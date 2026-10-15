import type { ReactNode } from 'react';
import DataTable from './DataTable';
import { cx } from './cx';

interface Row {
  label: string;
  value: ReactNode;
  next?: ReactNode;
  /** 변화량 표기(예: "+15", "−0.4s"). 1차 정보라 변경 후 옆에 작게 붙는다 */
  delta?: string;
  /** 변화가 나쁜 쪽이면 위험색 (기본은 액센트) */
  worse?: boolean;
}

// 강화/구매 확인 패널의 스탯 비교 표 — next가 있으면 현재→변경 후 3열, 없으면 2열.
// 값 열은 둘 다 픽셀 액센트(숫자)다 — 한 행 안에서 서체가 바뀌지 않게. 변경 후는 액센트색이고
// 변화량(delta)이 있으면 그 옆에 붙는다 — "무엇이 얼마나 바뀌나"가 이 표의 1차 정보다.
export default function StatCompare({ rows }: { rows: Row[] }) {
  const hasNext = rows.some(r => r.next !== undefined);
  return (
    <DataTable>
      {hasNext && <thead><tr><th>스탯</th><th>현재</th><th>변경 후</th></tr></thead>}
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.label}</td>
            <td className={cx('pf-accent', hasNext && 'text-text-dim')}>{r.value}</td>
            {hasNext && (
              <td className="pf-accent text-accent whitespace-nowrap">
                {r.next ?? '—'}
                {r.delta && (
                  <span className={cx('ml-1.5 text-2xs', r.worse ? 'text-danger' : 'text-gold')}>{r.delta}</span>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
