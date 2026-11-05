import type { ReactNode } from 'react';
import { cx } from './cx';
import Inset from './Inset';
import ListRow from './ListRow';
import type { ListRowState } from './ListRow';

export type LadderState = 'done' | 'current' | 'next' | 'locked';

export interface LadderStep {
  key: string;
  label: ReactNode;
  /** 이름 아래 간단한 수치. 항목마다 따로 둔다 */
  subs?: ReactNode[];
  /** 행 앞 그림(배 스프라이트 등) */
  leading?: ReactNode;
  /** 행 오른쪽 상태(체크, 지금, 가격, 잠금) */
  trailing?: ReactNode;
  state: LadderState;
}

/** 다음 단계가 확정 대상이라 고른 행(골드)으로 세운다 */
const ROW_STATE: Record<LadderState, ListRowState> = { done: 'done', current: 'current', next: 'selected', locked: 'locked' };

// 진행 사다리 — 단계 목록을 오목한 칸 안에 한 줄씩 쌓는다. 지나온 것은 흐리고, 현재는 하늘색, 다음(확정 대상)은
// 골드로 눌려 있고, 그 뒤는 오목하게 잠겨 있다. 목록형 시설(낚싯대 강화, 조선소)의 왼쪽 열이다.
export default function ProgressLadder({ steps, label, className }: {
  steps: LadderStep[];
  /** 목록의 접근성 이름 */
  label: string;
  className?: string;
}) {
  return (
    <Inset className={cx('p-2', className)}>
      <ol aria-label={label} className="list-none m-0 p-0 flex flex-col gap-1.5">
        {steps.map(s => (
          <li key={s.key} aria-current={s.state === 'current' ? 'step' : undefined}>
            <ListRow state={ROW_STATE[s.state]} leading={s.leading} name={s.label} subs={s.subs} trailing={s.trailing} />
          </li>
        ))}
      </ol>
    </Inset>
  );
}
