import type { ReactNode } from 'react';
import Note from '../../../ui/Note';
import { cx } from '../../../ui/cx';
import { CompareTable, FacilityTabBody } from './facilityParts';
import type { CompareRow } from './facilityParts';

// 판매 창의 두 탭(판매, 기운 얻기)이 함께 쓰는 탭 구성 — 왼쪽 칸은 어종 표이고, 오른쪽 칸은 위쪽 정렬의 비교 표와 아래 고정한 확정 영역이다.
// 확정 영역은 요약 줄, 되돌릴 수 없다는 안내 두 줄, 동작 줄(확정 버튼) 순서이고 두 탭이 같은 줄 수라 탭을 바꿔도 높이가 같다.
// 고른 것이 없어도 비교 표와 확정 영역의 자리는 그대로 두고 값만 바뀐다. 값이 바뀌지 않는 줄은 흐리게만 한다.
export default function PickTab({ empty, table, compareHeads, compareRows, summary, notes, actions }: {
  /** 가방이 비었는가 — 비었으면 왼쪽 칸에 어종 표 대신 안내를 보인다 */
  empty: boolean;
  /** 왼쪽 칸의 어종 표 */
  table: ReactNode;
  compareHeads: [string, string];
  compareRows: CompareRow[];
  /** 확정 영역 맨 위 요약 줄 — dim이면 흐리게 보인다(고른 것이 없을 때) */
  summary: { label: string; value: ReactNode; dim: boolean };
  /** 확정 버튼 바로 위 안내 두 줄 */
  notes: readonly [string, string];
  /** 확정 버튼 줄 */
  actions: ReactNode;
}) {
  return (
    <FacilityTabBody list={empty ? <Note>가방이 비어 있어요.<br />어군을 찾아 낚시해 보세요.</Note> : table}
      detail={<CompareTable heads={compareHeads} rows={compareRows} />}
      foot={(
        <>
          <div className={cx('flex items-center justify-between text-sm', summary.dim && 'opacity-50')}>
            <span className="text-text-dim">{summary.label}</span>
            {summary.value}
          </div>
          <Note className="my-0">{notes[0]}<br />{notes[1]}</Note>
          {actions}
        </>
      )} />
  );
}
