import type { ReactNode } from 'react';
import { cx } from '../../ui/cx';
import { useMobileLayout } from '../useMobileLayout';

// 스테이지 — 모바일 배치에서는 탭 줄을 뺀 화면 전체를 쓰고, 이 안을 위에서부터 헤더(1행), 게임 영역(2행), 채팅 영역(3행)으로
// 나누는 격자다. 헤더는 왼쪽 칸이 자원 바, 오른쪽 칸이 메뉴 버튼이다. 각 영역의 요소는 자기 행에 놓이고, 절대 위치 요소는 그 행을
// 기준 상자로 삼는다. 그래서 채팅 영역이 접히거나 키보드가 올라와 3행이 바뀌면 게임 영역이 남는 높이를 받는다.
// 스테이지에서는 두 번 눌러 확대, 길게 눌러 선택과 메뉴, 끌어서 화면 스크롤을 막는다(touch-none, select-none, 길게 누르기 메뉴 차단).
// PC 배치의 --log-clear는 프레임 아래쪽에서 메시지 창이 프레임 안으로 들어오는 높이다. 메시지 창 높이(--log-h, 메시지 창이 알린다)에
// 창의 아래 여백 12px을 더하고 프레임 아래 남는 여백(스테이지 높이와 프레임 높이 차의 절반)을 뺀다. 프레임 안에 놓이는 화면이 이 높이를 비운다.
export default function GameStageLayout({ children }: { children: ReactNode }) {
  const mobile = useMobileLayout();
  return (
    <div data-game-stage className={cx('relative min-w-0 overflow-hidden bg-bg [container-type:size]',
      mobile
        ? 'flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)_auto] touch-none select-none [-webkit-touch-callout:none]'
        : 'flex-1 flex items-center justify-center [--frame-h:min(65vh,100cqh,calc(100cqw*9/16))] [--log-clear:max(0px,calc(var(--log-h)_+_12px_-_(100cqh_-_var(--frame-h))_/_2))] max-[820px]:flex-[1_1_55%]')}
         onContextMenu={mobile ? e => e.preventDefault() : undefined}>
      {children}
    </div>
  );
}
