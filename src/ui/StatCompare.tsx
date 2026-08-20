import type { ReactNode } from 'react';

interface Row { label: string; value: ReactNode; next?: ReactNode }

// 강화/구매 확인 패널의 스탯 비교 표 — next가 있으면 현재→변경후 2열, 없으면 단일 값
export default function StatCompare({ rows }: { rows: Row[] }) {
  const hasNext = rows.some(r => r.next !== undefined);
  return (
    <table className="pf-compare">
      {hasNext && <thead><tr><th>스탯</th><th>현재</th><th>변경 후</th></tr></thead>}
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.label}</td>
            <td>{r.value}</td>
            {hasNext && <td className="next pf-accent">{r.next}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
