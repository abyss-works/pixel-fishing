import type { ReactNode } from 'react';
import { cx } from './cx';
import PixelIcon from './PixelIcon';

export type LadderState = 'done' | 'current' | 'next' | 'locked';

export interface LadderStep {
  key: string;
  label: ReactNode;
  /** 수치·조건 요약 — 픽셀 액센트는 호출자가 숫자에만 건다 */
  meta?: ReactNode;
  /** 행 앞 그림(배 스프라이트 등) */
  leading?: ReactNode;
  state: LadderState;
}

// 진행 사다리 — 단계 목록에서 지나온 것·현재·다음·잠긴 것을 한 줄씩 보여준다.
// 현재는 골드, 다음은 액센트(확정 대상), 지나온 것과 잠긴 것은 보조색. pf-frame 목록 규약 그대로.
export default function ProgressLadder({ steps, className }: { steps: LadderStep[]; className?: string }) {
  return (
    <ol className={cx('pf-frame divide-y divide-line list-none m-0 p-0', className)}>
      {steps.map(s => (
        <li key={s.key} aria-current={s.state === 'current' ? 'step' : undefined}
            className={cx('flex items-center gap-2 px-2 py-1 text-sm',
              s.state === 'current' && 'bg-surface-2',
              (s.state === 'done' || s.state === 'locked') && 'text-text-dim')}>
          {s.leading && <span className="shrink-0">{s.leading}</span>}
          <span className="min-w-0 flex-1 flex flex-col">
            <span className={cx('flex items-center gap-1.5',
              s.state === 'current' && 'text-gold', s.state === 'next' && 'text-accent')}>
              {s.state === 'done' && <PixelIcon glyph="checkOn" size={10} />}
              {s.state === 'locked' && <PixelIcon glyph="lock" size={10} />}
              <span className="truncate">{s.label}</span>
              {s.state === 'current' && <span className="text-2xs text-text-dim">현재</span>}
              {s.state === 'next' && <span className="text-2xs">다음</span>}
            </span>
            {s.meta && <span className="text-xs text-text-dim">{s.meta}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
