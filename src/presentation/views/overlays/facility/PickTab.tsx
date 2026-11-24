import type { ReactNode } from 'react';
import Note from '../../../ui/Note';
import { cx } from '../../../ui/cx';
import { CompareTable, FacilityTabBody } from './facilityParts';
import type { CompareRow } from './facilityParts';

interface PickSummaryRow {
  label: string;
  value: ReactNode;
  dim?: boolean;
}

const toSummaryRows = (summary: PickSummaryRow | readonly PickSummaryRow[]): readonly PickSummaryRow[] =>
  Array.isArray(summary) ? summary : [summary as PickSummaryRow];

// 판매 창의 두 탭(판매, 기운 얻기)이 함께 쓰는 탭 구성 — 왼쪽 칸은 어종 표이고, 오른쪽 칸은 위쪽 정렬의 비교 표와 아래 고정한 확정 영역이다.
// 확정 영역은 요약 줄(판매할 마릿수·받을 골드 등), 되돌릴 수 없다는 안내 두 줄, 동작 줄(확정 버튼) 순서다.
// 동작 줄은 최소 높이(min-h-11) 칸에 담아 평상시 버튼 위치를 맞추고, 긴 문구로 줄바꿈이 생기면 칸과 버튼이 세로로 함께 늘어나 넘치지 않는다.
// 고른 것이 없어도 비교 표와 확정 영역의 자리는 그대로 두고 값만 바뀐다. 값이 바뀌지 않는 줄은 흐리게만 한다.
export default function PickTab({ empty, table, compareHeads, compareRows, summary, notes, actions }: {
  /** 가방이 비었는가 — 비었으면 왼쪽 칸에 어종 표 대신 안내를 보인다 */
  empty: boolean;
  /** 왼쪽 칸의 어종 표 */
  table: ReactNode;
  compareHeads: [string, string];
  compareRows: CompareRow[];
  /** 확정 영역 맨 위 요약 줄 — dim이면 흐리게 보인다(고른 것이 없을 때) */
  summary: PickSummaryRow | readonly PickSummaryRow[];
  /** 확정 버튼 바로 위 안내 두 줄 */
  notes: readonly [string, string];
  /** 확정 버튼 줄 */
  actions: ReactNode;
}) {
  const rows = toSummaryRows(summary);
  return (
    <FacilityTabBody list={empty ? <Note>가방이 비어 있어요.<br />어군을 찾아 낚시해 보세요.</Note> : table}
      detail={<CompareTable heads={compareHeads} rows={compareRows} />}
      foot={(
        <>
          {rows.map(row => (
            <div key={row.label} className={cx('flex items-baseline justify-between gap-2 flex-wrap text-sm', row.dim && 'text-text-dim')}>
              <span className="text-text-dim shrink-0">{row.label}</span>
              <span className="ml-auto text-right min-w-0">{row.value}</span>
            </div>
          ))}
          <Note className="my-0">{notes[0]}<br />{notes[1]}</Note>
          <div data-confirm-row className="flex flex-col min-h-11">{actions}</div>
        </>
      )} />
  );
}
