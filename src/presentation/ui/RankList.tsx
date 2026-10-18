import { cx } from './cx';
import DataTable from './DataTable';

// 순위 표 — 순위·닉네임·값 세 열. 내 행을 강조하고, 내가 목록 밖이면 표 아래에 내 순위를 따로 적는다.
// 값의 표기(단위·자릿수)는 호출부가 format으로 정한다.
export interface RankListRow { rank: number; nickname: string | null; value: number; me: boolean }

const ME = 'text-accent';
const nameOf = (nickname: string | null) => nickname ?? '이름 없음';

export default function RankList({ rows, me, valueLabel, format, className }: {
  rows: RankListRow[];
  me: { rank: number; value: number } | null;
  /** 값 열 제목 */
  valueLabel: string;
  format: (value: number) => string;
  className?: string;
}) {
  const meInList = rows.some(r => r.me);
  return (
    <div className={className}>
      <DataTable>
        <thead><tr><th>순위</th><th>닉네임</th><th>{valueLabel}</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={cx(r.me && ME)} aria-current={r.me ? 'true' : undefined}>
              <td>{r.rank}</td><td>{nameOf(r.nickname)}</td><td>{format(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {me && !meInList && (
        <p className={cx('mt-2 text-sm', ME)}>내 순위 {me.rank}위 · {format(me.value)}</p>
      )}
    </div>
  );
}
