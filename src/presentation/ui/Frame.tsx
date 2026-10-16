import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

type FrameTag = 'div' | 'section' | 'ul' | 'li' | 'span' | 'button';

// 프레임 — 노치+베벨 틀(`pf-frame`)의 단일 출처. 화면은 클래스를 직접 쓰지 않고 이 컴포넌트를 쓴다.
// divided는 안쪽 행 사이에 구분선을 긋는다(목록형 틀). 여백·배치는 className으로 준다.
// 제목·닫기가 있는 박스는 Panel을 쓴다.
export default function Frame({ as: Tag = 'div', divided, className, children, ...rest }: {
  as?: FrameTag;
  /** as="button"일 때 */
  type?: 'button';
  divided?: boolean;
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cx('pf-frame', divided && 'divide-y divide-line', className)} {...rest}>
      {children}
    </Tag>
  );
}
