import type { ReactNode } from 'react';
import { cx } from './cx';

// 오목한 칸 — 패널 표면 안을 한 단 파낸 자리. 노치는 프레임과 같고 베벨만 반전(눌림)해
// 표면 위에 떠 있는 Frame과 달리 표면 아래로 들어가 보인다. 패널 안에 패널을 겹치지 않고
// 구역을 나눌 때 쓴다. divided는 안쪽 행 사이에 구분선을 긋는다.
export default function Inset({ divided, className, children }: {
  divided?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <div className={cx('pf-notch bg-bg shadow-[inset_2px_2px_0_var(--bevel-hi),inset_-1px_-1px_0_var(--bevel-lo)]',
                       divided && 'divide-y divide-line', className)}>
      {children}
    </div>
  );
}
