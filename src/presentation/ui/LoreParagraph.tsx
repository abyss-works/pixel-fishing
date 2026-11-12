import type { ReactNode } from 'react';
import { cx } from './cx';

// 로어 한 문단. 기본은 강조 없이 그린다. emphasis를 켜면 문단마다 첫 글자를 강조색(골드)과 1.25배 크기로 보인다.
// 첫 글자는 줄 안에서 커지고 줄 높이를 1로 고정해 둘째 줄 자리를 밀지 않는다. 강조는 네임드 상세(도감 로어와 전승)만 켠다.
// 글자색과 크기, 줄 간격은 호출자가 className으로 정한다.
export default function LoreParagraph({ className, emphasis = false, children }: {
  className?: string; emphasis?: boolean; children: ReactNode;
}) {
  return (
    <p className={cx(emphasis && 'first-letter:text-[1.25em] first-letter:leading-none first-letter:text-gold', className)}>
      {children}
    </p>
  );
}
