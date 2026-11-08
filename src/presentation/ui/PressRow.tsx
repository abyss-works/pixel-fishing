import type { ReactNode } from 'react';
import { cx } from './cx';

// 누르는 줄 - 구분선 틀(Frame divided) 안의 한 줄이 상세 창을 연다. 줄 내용은 호출자가 그리고,
// 누를 수 있다는 표시는 마우스를 올렸을 때의 배경과 키보드 포커스 윤곽이다. 접근성 이름은 줄 안의 글이 맡는다.
export default function PressRow({ onPress, className, children }: {
  onPress: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onPress}
            className={cx('block w-full cursor-pointer text-left hover:bg-surface-2', className)}>
      {children}
    </button>
  );
}
