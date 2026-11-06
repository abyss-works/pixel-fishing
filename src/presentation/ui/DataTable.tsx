import type { ReactNode } from 'react';
import { cx } from './cx';
import { tableMinWidth } from './tableLayout';

// 공통 표. 두 가지 배치가 있다.
// - cols 없음: 내용 폭에 맞추는 자동 배치. 셀 스타일은 전역 스타일 .pf-table가 후손 셀렉터로 담당한다.
//   글자를 자르지 않고 줄을 바꾼다. 칸을 두르지 않으므로 넘치는 표는 담는 쪽 칸이 스크롤한다.
// - cols 있음: 열 폭을 고정하는 배치. 목록 창의 표가 쓴다. cols는 열마다 CSS 폭이고, null이 남는 폭을 받는 이름 열이다.
//   표는 고정 열의 합에 이름 열 최소 폭(nameMin)을 더한 폭 밑으로 줄지 않는다. 담은 칸이 그보다 좁으면
//   글자를 자르지 않고 칸(TableBox) 안에서 표만 가로로 스크롤한다.
// 열 구성은 호출부가 thead/tbody로 조립한다.
export default function DataTable({ cols, nameMin = '8rem', className, children, 'aria-label': label }: {
  cols?: (string | null)[];
  nameMin?: string;
  className?: string;
  'aria-label'?: string;
  children: ReactNode;
}) {
  if (!cols) return <table className={cx('pf-table', className)} aria-label={label}>{children}</table>;
  return (
    <table className={cx('w-full table-fixed border-collapse text-sm', className)} aria-label={label}
           style={{ minWidth: tableMinWidth(cols, nameMin) }}>
      <colgroup>{cols.map((width, i) => <col key={i} style={width ? { width } : undefined} />)}</colgroup>
      {children}
    </table>
  );
}
