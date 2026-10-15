import { useLayoutEffect, useRef, useState } from 'react';
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
// size="lg"는 정비 패널처럼 사다리가 화면의 주인공인 곳에서 행을 키운다(여백·글자·아이콘).
// visibleRows를 주면 그만큼만 보이고 안에서 굴린다. 처음에는 현재 행이 가운데 오도록 스크롤을 맞추되
// 목록 끝을 넘기는 여백은 두지 않는다 — 첫·끝 행이 현재면 그 끝에 붙는다.
export default function ProgressLadder({ steps, visibleRows, size = 'md', className }: {
  steps: LadderStep[]; visibleRows?: number; size?: 'md' | 'lg'; className?: string;
}) {
  const lg = size === 'lg';
  const icon = lg ? 12 : 10;
  const ref = useRef<HTMLOListElement>(null);
  const [maxH, setMaxH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !visibleRows) return;
    const current = el.querySelector<HTMLElement>('[aria-current="step"]') ?? el.firstElementChild as HTMLElement | null;
    const rowH = current?.offsetHeight ?? 0;
    if (rowH === 0) return; // jsdom — 측정 불가면 전부 보인다
    setMaxH(rowH * visibleRows);
  }, [steps, visibleRows]);
  // 높이가 적용된 뒤에 스크롤 — 같은 효과 안에서 하면 overflow가 아직 없어 scrollTop이 0에 머문다.
  // offsetTop은 목록(relative) 기준이라 바깥 패널의 위치가 섞이지 않는다.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || maxH === null) return;
    const current = el.querySelector<HTMLElement>('[aria-current="step"]');
    if (!current) return;
    const want = current.offsetTop - (el.clientHeight - current.offsetHeight) / 2;
    el.scrollTop = Math.max(0, Math.min(want, el.scrollHeight - el.clientHeight));
  }, [maxH]);
  return (
    <ol ref={ref} style={maxH !== null ? { maxHeight: maxH } : undefined}
        className={cx('pf-frame divide-y divide-line list-none m-0 p-0 relative',
          !!visibleRows && 'pf-scroll overflow-y-auto', className)}>
      {steps.map(s => (
        <li key={s.key} aria-current={s.state === 'current' ? 'step' : undefined}
            className={cx('flex items-center', lg ? 'gap-3 px-3 py-2 text-base' : 'gap-2 px-2 py-1 text-sm',
              s.state === 'current' && 'bg-surface-2',
              (s.state === 'done' || s.state === 'locked') && 'text-text-dim')}>
          {s.leading && <span className="shrink-0 flex items-center">{s.leading}</span>}
          <span className="min-w-0 flex-1 flex flex-col">
            <span className={cx('flex items-center gap-1.5',
              s.state === 'current' && 'text-gold', s.state === 'next' && 'text-accent')}>
              {s.state === 'done' && <PixelIcon glyph="checkOn" size={icon} />}
              {s.state === 'locked' && <PixelIcon glyph="lock" size={icon} />}
              <span className="truncate">{s.label}</span>
              {s.state === 'current' && <span className={cx(lg ? 'text-xs' : 'text-2xs', 'text-text-dim')}>현재</span>}
              {s.state === 'next' && <span className={lg ? 'text-xs' : 'text-2xs'}>다음</span>}
            </span>
            {s.meta && <span className={cx(lg ? 'text-sm' : 'text-xs', 'text-text-dim')}>{s.meta}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
