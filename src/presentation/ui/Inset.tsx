import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

// 오목한 칸 — 패널 표면 안을 한 단 파낸 자리. 노치는 프레임과 같고 베벨만 반전(눌림)해
// 표면 위에 떠 있는 Frame과 달리 표면 아래로 들어가 보인다. 패널 안에 패널을 겹치지 않고
// 구역을 나눌 때 쓴다. divided는 안쪽 행 사이에 구분선을 긋는다.
// tone은 파낸 깊이(바닥 밝기)다 — deep은 바탕색, base(기본)는 바탕과 표면의 중간, light는 표면에 가깝다.
// border는 테두리 색 토큰이다 — 기본 border-line과 다른 색을 겹치면 CSS 선언 순서에 밀리므로 prop으로 고른다.
const TONE = {
  deep: 'bg-bg',
  base: 'bg-(--inset-base)',
  light: 'bg-(--inset-light)',
} as const;

const BORDER = {
  line: 'border-line',
  gold: 'border-gold',
  accent: 'border-accent',
  common: 'border-common',
  rare: 'border-rare',
  epic: 'border-epic',
  legend: 'border-legend',
} as const;

export type InsetBorder = keyof typeof BORDER;

type InsetTag = 'div' | 'li' | 'section';

export default function Inset({
  as: Tag = 'div',
  tone = 'base',
  border = 'line',
  title,
  divided,
  borderless,
  className,
  children,
  ...rest
}: {
  as?: InsetTag;
  tone?: keyof typeof TONE;
  border?: InsetBorder;
  title?: string;
  divided?: boolean;
  borderless?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <Tag className={cx('pf-notch shadow-[inset_1px_1px_0_var(--bevel-hi),inset_-1px_-1px_0_var(--bevel-lo)]',
                       !borderless && 'border',
                       !borderless && BORDER[border],
                       TONE[tone], divided && 'divide-y divide-line', className)} {...rest}>
      {title && <h3 className="pf-accent text-base text-gold">{title}</h3>}
      {children}
    </Tag>
  );
}
