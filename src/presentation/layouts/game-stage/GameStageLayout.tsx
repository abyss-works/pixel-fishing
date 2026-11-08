import type { ReactNode } from 'react';
import { cx } from '../../ui/cx';
import { useMobileLayout } from '../useMobileLayout';

// 스테이지 — 모바일 레이아웃에서는 탭 줄을 뺀 화면 전체를 쓰고, 이 안을 위에서부터 헤더(1행), 게임 영역(2행)으로
// 나누는 격자다. 헤더는 왼쪽부터 자원 바(1열), 메뉴 버튼(2열)이다. 각 영역의 요소는 자기 행에 놓이고, 절대 위치 요소는 그 행을
// 기준 상자로 삼는다. 채팅은 격자 행이 아니라 게임 영역 아래쪽 위에 겹쳐 뜨므로(HudLayout) 채팅을 접고 펴거나 키보드가 올라와도
// 게임 영역의 크기는 바뀌지 않는다. 화면 키보드도 게임 영역 아래를 덮을 뿐 스테이지 크기를 줄이지 않는다(채팅 묶음만 --keyboard-h로 키보드 위에 붙는다). PC 레이아웃의 채팅도 스테이지 위에 떠서 카드 메뉴가 채팅 자리를 비우지 않는다.
// 프레임 높이(--frame-h)는 16:9 프레임의 크기이고, 프레임 안에 놓이는 화면이 읽는다.
// 스테이지에서는 두 번 눌러 확대, 길게 눌러 선택과 메뉴, 끌어서 화면 스크롤을 막는다(touch-none, select-none, 길게 누르기 메뉴 차단).
export default function GameStageLayout({ children }: { children: ReactNode }) {
  const mobile = useMobileLayout();
  return (
    <div data-game-stage className={cx('relative min-w-0 overflow-hidden bg-bg [container-type:size]',
      mobile
        ? 'flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)] touch-none select-none [-webkit-touch-callout:none]'
        : 'flex-1 flex items-center justify-center [--frame-h:min(65vh,100cqh,calc(100cqw*9/16))]')}
         onContextMenu={mobile ? e => e.preventDefault() : undefined}>
      {children}
    </div>
  );
}
