import type { ReactNode } from 'react';
import type { GameState } from '../../../game/rules/logic';
import MobileResourceBar from '../../ui/hud/MobileResourceBar';
import ResourceBar from '../../ui/hud/ResourceBar';
import { cx } from '../../ui/cx';
import { HEADER_TIER_CLASS } from '../../ui/hud/headerTier';
import { useMobileLayout } from '../useMobileLayout';

// 상단 - 자원 바와 메뉴 버튼 두 덩어리를 각각 별도 틀로 둔다. 의뢰는 헤더에 두지 않고 메뉴 줄의 맨 위 항목으로 연다.
// PC 레이아웃: 스테이지 위쪽의 헤더 행(전체 폭 격자 `1fr auto 1fr`)에 자원 바(2열, 가운데)와 메뉴 버튼(3열, 오른쪽 끝)을 형제로 둔다.
// 메뉴 버튼은 자원 바 높이의 세로 가운데에 맞춘다. 폭이 모자라면 자원 바가 메뉴 버튼에 밀려 왼쪽으로 옮겨지고 두 틀은 겹치지 않는다.
// 헤더 행은 pointer-events-none이라 틀 밖은 필드 입력을 가리지 않는다. 헤더 행 자체는 층을 만들지 않아(층 토큰 없음) 두 틀이 각자 층으로 놓인다.
// 단계(기본, 간격 축소, 두 행)는 스테이지 폭 container query가 바꾸는 CSS 변수로 정하고(headerTier), 두 행 단계에서만 자원 바 본문이 모바일 구성(ResourceRows)이다.
// 펼친 메뉴 줄은 메뉴 버튼 오른쪽 아래에 떠서(GameMenu) 헤더 행의 높이를 바꾸지 않는다.
// 모바일 레이아웃: 스테이지 격자의 1행에 자원 바(두 행)와 메뉴 버튼을 왼쪽부터 놓는다. 메뉴 버튼(40px)은 자원 바 높이의 세로 가운데에 맞춘다.
// 화면 키보드 때문에 보이는 영역이 위로 밀리면(--keyboard-top) 두 틀이 그만큼 아래로 비켜서 보이는 영역 안에 남는다. 위치 변환이 아니라 상대 위치 오프셋이라 창의 기준 상자를 만들지 않는다.
// 자원 바를 누르면 스탯 창이 열린다.
// 헤더는 채팅과 같은 층(chrome)이라 스테이지 위 HUD(카드 묶음 포함) 위에 놓이고, 창의 바탕이 헤더까지 덮는다. 메뉴 버튼 자리(펼친 줄 포함)는 한 단 높은 층(menu-row)이라 DOM 순서와 무관하게 채팅 위에 놓인다.
export default function HudHeader({ game, bagBonus = 0, onOpenStats, menu }: {
  game: GameState;
  bagBonus?: number;
  onOpenStats: () => void;
  /** 메뉴 버튼(펼친 줄 포함) */
  menu: ReactNode;
}) {
  const mobile = useMobileLayout();
  if (mobile) {
    return (
      <>
        <MobileResourceBar game={game} bagBonus={bagBonus} onOpen={onOpenStats} />
        <div className="z-(--z-menu-row)
                        mobile:relative mobile:top-[var(--keyboard-top,0px)] mobile:col-start-2 mobile:row-start-1 mobile:mx-1 mobile:my-1 mobile:self-center">
          {menu}
        </div>
      </>
    );
  }
  return (
    <div className={cx('absolute inset-x-0 top-0 grid grid-cols-[1fr_auto_1fr] items-center px-(--hdr-inset) pt-(--hdr-inset) pointer-events-none', HEADER_TIER_CLASS)}>
      <div className="relative z-(--z-chrome) col-start-2 pointer-events-auto">
        <ResourceBar game={game} bagBonus={bagBonus} onOpen={onOpenStats} />
      </div>
      <div className="relative z-(--z-menu-row) col-start-3 ml-(--hdr-inset) justify-self-end pointer-events-auto">
        {menu}
      </div>
    </div>
  );
}
