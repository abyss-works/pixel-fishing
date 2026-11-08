import type { ReactNode } from 'react';
import type { GameState } from '../../../game/rules/logic';
import MobileResourceBar from '../../ui/hud/MobileResourceBar';
import ResourceBar from '../../ui/hud/ResourceBar';
import { useMobileLayout } from '../useMobileLayout';

// 상단 - 자원 바와 메뉴 버튼 두 덩어리를 각각 별도 틀로 늘어놓는다. 의뢰는 헤더에 두지 않고 메뉴 줄의 맨 위 항목으로 연다.
// PC 레이아웃: 스테이지 위쪽 가운데에 자원 바(골드, 명성, 배, 낚싯대, 가방 다섯 칸을 한 행에, 칸마다 위에 아이콘과 이름 아래에 값)를 두고,
// 메뉴 버튼은 오른쪽 위 모서리에 둔다. 두 틀의 높이는 60px로 같고, 스테이지 폭에 따라 줄어드는 단계는 없다.
// 모바일 레이아웃: 스테이지 격자의 1행에 자원 바(두 행)와 메뉴 버튼을 왼쪽부터 놓는다. 메뉴 버튼(40px)은 자원 바 높이의 세로 가운데에 맞춘다.
// 자원 바를 누르면 스탯 창이 열린다.
// 메뉴 버튼 자리는 한 단 높은 층(card)이라, 펼친 줄이 게임 영역의 카드 묶음(overlay) 위에 놓인다.
export default function HudHeader({ game, bagBonus = 0, onOpenStats, menu }: {
  game: GameState;
  bagBonus?: number;
  onOpenStats: () => void;
  /** 메뉴 버튼(펼친 줄 포함). 열 입구가 없으면 아무것도 그리지 않는다 */
  menu: ReactNode;
}) {
  const mobile = useMobileLayout();
  return (
    <>
      {mobile ? (
        <MobileResourceBar game={game} bagBonus={bagBonus} onOpen={onOpenStats} />
      ) : (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-(--z-overlay) flex items-start">
          <ResourceBar game={game} bagBonus={bagBonus} onOpen={onOpenStats} />
        </div>
      )}
      <div className="absolute right-3 top-3 z-(--z-card) empty:hidden
                      mobile:relative mobile:right-auto mobile:top-auto mobile:col-start-3 mobile:row-start-1 mobile:mr-1 mobile:my-1 mobile:self-center">
        {menu}
      </div>
    </>
  );
}
