import type { ReactNode } from 'react';
import { cx } from '../../ui/cx';
import { useMobileLayout } from '../useMobileLayout';

// 스테이지 — 모바일 배치에서는 탭 줄을 뺀 화면 전체를 쓴다. 스테이지에서는 두 번 눌러 확대, 길게 눌러 선택과 메뉴,
// 끌어서 화면 스크롤을 막는다(touch-none, select-none, 길게 누르기 메뉴 차단).
export default function GameStageLayout({ children }: { children: ReactNode }) {
  const mobile = useMobileLayout();
  return (
    <div className={cx('relative min-w-0 overflow-hidden bg-bg [container-type:size]',
      mobile
        ? 'flex-1 min-h-0 touch-none select-none [-webkit-touch-callout:none]'
        : 'flex-1 flex items-center justify-center [--frame-h:min(65vh,100cqh,calc(100cqw*9/16))] max-[820px]:flex-[1_1_55%]')}
         onContextMenu={mobile ? e => e.preventDefault() : undefined}>
      {children}
    </div>
  );
}
