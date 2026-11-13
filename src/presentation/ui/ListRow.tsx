import type { ReactNode } from 'react';
import { cx } from './cx';
import Frame from './Frame';

export type ListRowState = 'done' | 'current' | 'selected' | 'locked' | 'open';

// 목록 행 — 목록형 시설(낚싯대 강화, 조선소, 상점)의 왼쪽 목록 한 줄. 앞 그림, 이름과 간단한 수치, 오른쪽 상태를 한 줄에 둔다.
// 상태마다 모양이 다르다. 지난 것(done)은 흐리고, 지금 것(current)은 하늘색 테두리, 고른 것(selected)은 골드 테두리로
// 눌려 있고, 아직 못 고르는 것(locked)은 오목하고 흐리다. 고를 수 있는 것(open)은 볼록한 기본 모양이다.
// 이름과 값은 말줄임하지 않는다. 좁아서 모자라면 이름과 수치가 줄을 바꾸고(수치는 항목 단위로), 행 높이는 그만큼만 커진다. 오른쪽 상태(가격)는 한 줄이다.
// onSelect가 있으면 고르는 행(listbox의 option)이 되고, 없으면 보기만 하는 행이다. 행 높이는 내용이 한 줄에 들어가는 한 상태와 무관하게 같다.
const ROW: Record<ListRowState, string> = {
  open: 'bg-surface-2',
  done: 'bg-surface-2 opacity-50',
  current: 'bg-surface-2 border-[color-mix(in_oklab,var(--c-accent)_60%,var(--c-line))]',
  selected: 'bg-surface-2 border-gold translate-y-px shadow-[inset_-2px_-2px_0_var(--bevel-lo),inset_2px_2px_0_var(--bevel-hi)]',
  locked: 'bg-[color-mix(in_oklab,var(--c-bg)_45%,var(--c-surface))] text-text-dim shadow-[inset_2px_2px_0_var(--bevel-hi),inset_-1px_-1px_0_var(--bevel-lo)]',
};

const NAME: Record<ListRowState, string> = {
  open: 'font-bold', done: 'font-bold', current: 'font-bold text-accent', selected: 'font-bold text-gold', locked: 'font-normal text-text-dim',
};

export default function ListRow({ state, leading, name, subs = [], trailing, onSelect, ariaLabel }: {
  state: ListRowState;
  /** 행 앞 그림(배 스프라이트, 색 칸) */
  leading?: ReactNode;
  name: ReactNode;
  /** 이름 아래 간단한 수치. 항목마다 따로 둔다 */
  subs?: ReactNode[];
  /** 행 오른쪽 상태(가격, 지금, 체크, 잠금) */
  trailing?: ReactNode;
  /** 주면 고르는 행이 된다 */
  onSelect?: () => void;
  ariaLabel?: string;
}) {
  const body = (
    <>
      {leading ? <span className="shrink-0 flex items-center">{leading}</span> : <span aria-hidden="true" />}
      <span className="min-w-0 flex flex-col gap-0.5">
        <b className={cx('text-sm break-keep', NAME[state])}>{name}</b>
        {subs.length > 0 && (
          <span className="flex flex-wrap gap-x-3 text-2xs text-text-dim">
            {subs.map((s, i) => <span key={i} className="whitespace-nowrap">{s}</span>)}
          </span>
        )}
      </span>
      <span className="text-xs text-right whitespace-nowrap flex items-center justify-end gap-1.5">{trailing}</span>
    </>
  );
  const className = cx('grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 min-h-12 py-1 px-2.5 w-full text-left', ROW[state]);
  if (onSelect) {
    return (
      <Frame as="button" type="button" role="option" aria-selected={state === 'selected'} aria-label={ariaLabel}
             onClick={onSelect}
             className={cx(className, 'cursor-pointer', state !== 'selected' && 'hover:border-accent')}>
        {body}
      </Frame>
    );
  }
  return <Frame className={className} aria-label={ariaLabel}>{body}</Frame>;
}
