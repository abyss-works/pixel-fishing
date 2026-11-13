import type { ReactNode } from 'react';
import type { GameAction } from '../../../../game/rules/actions';
import type { DispatchResult } from '../../../../features/gameplay/service/types';
import { useMobileLayout } from '../../../layouts/useMobileLayout';
import Button from '../../../ui/Button';
import DataTable from '../../../ui/DataTable';
import TableBox from '../../../ui/TableBox';
import Tip from '../../../ui/Tip';
import { SCROLL_Y } from '../../../ui/scrollArea';

// 목록형 시설(낚싯대 강화, 조선소, 상점)의 오른쪽 상세 열이 함께 쓰는 조각.

/** 창이 확정 동작을 맡기는 함수 — 바쁜 동안은 받지 않고, 거부는 메시지 창에 알리며, 성공하면 onOk를 부른다 */
export type FacilityAct = (action: GameAction, onOk?: (r: Extract<DispatchResult, { status: 'ok' }>) => void) => void;

export interface CompareRow {
  label: ReactNode;
  /** 현재 값. 비교할 현재 값이 없으면 비운다 */
  value?: ReactNode;
  /** 확정 후 값. 현재 열만 보이는 표(heads가 하나)에서는 쓰지 않는다 */
  next?: ReactNode;
  /** 변화량(예: "+15", "-0.4초") */
  delta?: string;
  /** 값이 바뀌지 않는 줄 — 자리는 그대로 두고 흐리게만 한다 */
  dim?: boolean;
}

/** 현재와 확정 후 비교 표 — 이름, 현재, 확정 후 세 열. 열 머리와 이름에 규칙 설명 툴팁을 달 수 있다.
 *  값 열 폭은 PC 레이아웃에서 7rem, 9rem으로 고정이고 모바일 레이아웃에서는 칸 폭의 비율이라 좁은 창에도 가로 스크롤 없이 들어간다(모바일은 표의 최소 폭을 풀어 비율이 담은 칸 폭만 따르고, 값 칸도 줄을 바꾼다).
 *  이름이 길면 이름 칸에서 줄을 바꾼다. heads가 하나면 확정 후 열 없이 현재 열만 보인다(더 바꿀 수 없는 최고 단계). */
export function CompareTable({ heads, rows }: { heads: [ReactNode] | [ReactNode, ReactNode]; rows: CompareRow[] }) {
  const showNext = heads.length > 1;
  const mobile = useMobileLayout();
  const cols = mobile ? [null, '30%', '40%'] : [null, '7rem', '9rem'];
  return (
    <TableBox className="shrink-0 px-3 pt-1 pb-2">
      <DataTable cols={showNext ? cols : cols.slice(0, 2)} nameMin={mobile ? '0px' : '6rem'}
                 className={`pf-table [&_th]:h-[30px] [&_th]:text-2xs [&_th]:text-right [&_td]:h-7 [&_td]:text-right
                            [&_td]:whitespace-nowrap [&_td]:border-b-0 [&_tbody_tr+tr_td]:border-t [&_tbody_tr+tr_td]:border-line/60
                            [&_th:first-child]:text-left [&_td:first-child]:text-left [&_th:first-child]:pl-0 [&_td:first-child]:pl-0
                            [&_th:last-child]:pr-0 [&_td:last-child]:pr-0 ${mobile ? 'min-w-0! [&_td]:whitespace-normal [&_td]:break-keep [&_th]:break-keep' : ''}`}>
        <thead><tr><th aria-label="항목" /><th>{heads[0]}</th>{showNext && <th>{heads[1]}</th>}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.dim ? 'opacity-50' : undefined}>
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

/** 두 열 본문 — 왼쪽은 목록, 오른쪽은 상세와 그 아래 고정한 확정 영역(foot)이다. 높이를 고정한 카드 안에서 두 열의 본문이 각자 스크롤한다.
 *  열 사이 틈은 18px이다. 목록 칸은 오른쪽으로 14px 내어 막대를 틈에 두고, 상세 칸은 왼쪽 4px 여백과 합쳐 두 칸이 겹치지 않는다.
 *  상세 칸은 카드 본문과 같이 오른쪽으로 8px 내어 막대를 카드 안쪽 가장자리에 둔다.
 *  확정 영역은 상세 칸의 내용 폭(막대와 여백을 뺀 6px 좁은 폭)에 맞춘다. 낚싯대, 조선소, 부엌 창이 쓴다. */
export function FacilityColumns({ list, detail, foot }: { list: ReactNode; detail: ReactNode; foot: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[18px] flex-1 min-h-0">
      <div className={`${SCROLL_Y} -mr-3.5 min-h-0`}>{list}</div>
      <div className="flex flex-col gap-3 min-w-0 min-h-0">
        <div className={`${SCROLL_Y} -mr-2 flex-1 min-h-0 flex flex-col gap-3 [&>*]:shrink-0`}>{detail}</div>
        <div className="flex flex-col gap-3 shrink-0 mr-1.5 [&>button]:w-full">{foot}</div>
      </div>
    </div>
  );
}

/** 탭 본문 — 두 열로 나뉘는 폭(PC 레이아웃)에서는 FacilityColumns이고, 한 열로 쌓이는 폭(모바일 레이아웃)에서는 목록과 상세가 스크롤 칸 하나에 쌓이고
 *  확정 영역(foot)은 그 아래에 고정한다. 어느 쪽이든 확정 영역은 스크롤 칸 밖에 있다. 탭이 있는 창(높이 고정)의 탭 안에서 쓴다. */
export function FacilityTabBody({ list, detail, foot }: { list: ReactNode; detail: ReactNode; foot: ReactNode }) {
  const mobile = useMobileLayout();
  if (!mobile) return <FacilityColumns list={list} detail={detail} foot={foot} />;
  return (
    <>
      <div className={`${SCROLL_Y} -mr-2 flex-1 min-h-0 flex flex-col gap-4 [&>*]:shrink-0`}>
        {list}
        <div className="flex flex-col gap-3 min-w-0">{detail}</div>
      </div>
      <div className="border-t border-line pt-2 flex flex-col gap-2 shrink-0">{foot}</div>
    </>
  );
}
