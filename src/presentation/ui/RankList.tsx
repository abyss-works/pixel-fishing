import type { ReactNode } from 'react';
import { cx } from './cx';
import DataTable from './DataTable';
import Inset from './Inset';
import ProgressCount from './ProgressCount';
import Tip from './Tip';

// 공용 순위 표 — 1~3위 순위 숫자는 골드, 내 줄은 하늘색 이름과 옅은 하늘색 배경 강조로 구분하고,
// 오른쪽 수치 열은 내 줄과 하단 고정 내 순위 바를 포함한 모든 행에 동일한 골드 강조 규칙을 적용한다.
export interface RankListRow { rank: number; nickname: string | null; value: number; me: boolean }

const HEAD = 'h-[30px] px-2 font-normal border-b border-line';
const nameOf = (nickname: string | null) => nickname ?? '이름 없음';

function renderRankValue(value: number, format: (value: number) => ReactNode): ReactNode {
  const formatted = format(value);
  return typeof formatted === 'string' || typeof formatted === 'number'
    ? <ProgressCount value={formatted} />
    : formatted;
}

/** 목록 밖에 있는 내 순위를 표 아래에 고정하는 바 */
export function RankMeBar({
  me,
  format,
  compact = false,
  reserveSpace = false,
}: {
  me: { rank: number; value: number } | null;
  format: (value: number) => ReactNode;
  compact?: boolean;
  reserveSpace?: boolean;
}) {
  if (!me) return reserveSpace ? <div className="h-9 shrink-0" aria-hidden="true" /> : null;

  const rankTone = me.rank <= 3 ? 'gold' : 'accent';
  const rankClass = cx('pf-accent text-xs', rankTone === 'gold' ? 'text-gold' : 'text-accent');
  if (compact) {
    return (
      <div
        className="mt-auto flex items-center justify-between gap-2 border-t border-line px-2 py-1.5 text-sm bg-accent/10"
        data-me="true"
        data-rank={me.rank}
        aria-label="내 순위"
      >
        <span className="flex items-center gap-1.5 text-accent font-bold">
          <span>내 순위</span>
          <span className={rankClass} data-rank-tone={rankTone}>{me.rank}위</span>
        </span>
        <span className="text-xs whitespace-nowrap">{renderRankValue(me.value, format)}</span>
      </div>
    );
  }
  return (
    <Inset
      tone="light"
      border="accent"
      className="h-9 shrink-0 grid grid-cols-[3.5rem_minmax(0,1fr)_136px] mobile:grid-cols-[2.5rem_minmax(0,1fr)_144px] mobile:px-2.5 items-center px-3 text-sm bg-accent/10"
      data-me="true"
      data-rank={me.rank}
      aria-label="내 순위"
    >
      <span className={rankClass} data-rank-tone={rankTone}>{me.rank}</span>
      {/* 표의 닉네임 칸과 같은 왼쪽 여백 */}
      <b className="pl-2 truncate text-accent">나</b>
      <span className="text-right text-xs whitespace-nowrap">{renderRankValue(me.value, format)}</span>
    </Inset>
  );
}

export default function RankList({
  rows,
  me,
  valueLabel,
  valueHelp,
  format,
  cols,
  nameMin,
  embedded = false,
  className,
}: {
  rows: readonly RankListRow[];
  me: { rank: number; value: number } | null;
  /** 값 열 제목 */
  valueLabel: string;
  /** 값 열 제목 툴팁 */
  valueHelp?: string | null;
  format: (value: number) => ReactNode;
  cols?: (string | null)[];
  nameMin?: string;
  /** true면 표만 렌더하고 바깥 스크롤/틀은 호출부가 감싼다 */
  embedded?: boolean;
  className?: string;
}) {
  const meInList = rows.some(r => r.me);
  const table = (
    <DataTable cols={cols} nameMin={nameMin}>
      <thead>
        <tr className="sticky top-0 bg-[color-mix(in_oklab,var(--c-bg)_45%,var(--c-surface))] text-2xs text-text-dim">
          <th className={cx(HEAD, 'pl-0 text-left')}>순위</th>
          <th className={cx(HEAD, 'text-left')}>닉네임</th>
          <th className={cx(HEAD, 'pr-0 text-right')}>
            {valueHelp ? <Tip text={valueHelp}>{valueLabel}</Tip> : valueLabel}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const cell = cx('h-[34px]', i > 0 && 'border-t border-line/60');
          const rankTone = r.rank <= 3 ? 'gold' : r.me ? 'accent' : 'default';
          return (
            <tr
              key={i}
              className={cx(r.me && 'bg-accent/10')}
              data-rank={r.rank}
              data-me={r.me ? 'true' : undefined}
              aria-current={r.me ? 'true' : undefined}
            >
              <td
                className={cx(cell, 'pf-accent text-xs', r.rank <= 3 ? 'text-gold' : r.me && 'text-accent')}
                data-rank-tone={rankTone}
              >
                {r.rank}
              </td>
              <td className={cx(cell, 'px-2 truncate', r.me && 'text-accent font-bold')}>
                {nameOf(r.nickname)}
              </td>
              <td className={cx(cell, 'pl-2 text-right text-xs whitespace-nowrap')}>
                {renderRankValue(r.value, format)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );

  if (embedded) return table;

  return (
    <div className={cx('pf-scroll-panel overflow-x-auto', className)}>
      {table}
      {me && !meInList && <RankMeBar me={me} compact format={format} />}
    </div>
  );
}
