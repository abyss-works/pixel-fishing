import type { ReactNode } from 'react';
import type { GameState } from '../../../game/rules/logic';
import QuestStatus from '../../ui/hud/QuestStatus';
import ResourceBar from '../../ui/hud/ResourceBar';
import { clearsCaps } from '../../../features/bounty/model/panel';

/** 서버 값(오늘 남은 클리어)이 아직 없을 때 보이는 수 */
const UNKNOWN = 0;

// 헤더 - 자원 바, 의뢰 현황, 메뉴 버튼 세 덩어리를 각각 별도 틀로 늘어놓는다. 세 틀의 높이는 같다(스테이지 폭이 넓으면
// 60px, 960px 미만이면 40px). 메뉴 버튼은 그 높이의 정사각형이다.
// PC 배치는 스테이지 위쪽 가운데에 자원 바와 의뢰 현황을 나란히 두고, 메뉴 버튼은 오른쪽 위 모서리에 둔다.
// 가운데 묶음이 오른쪽의 메뉴 버튼과 거점의 시계 칩과 겹치지 않도록, 960px 미만에서는 틀을 낮추고 값 칸을 줄인다.
// 메뉴 버튼 자리는 한 단 높은 층(card)이라, 펼친 줄이 게임 영역의 카드 묶음(overlay) 위에 놓인다.
// 모바일 배치는 스테이지 격자의 1행에 세 덩어리를 왼쪽부터 놓고, 메뉴 버튼은 헤더 높이에 맞춘 정사각형이다.
// 배와 낚싯대는 두지 않는다(스탯 창에서 본다). 칸은 처음부터 모두 그려, 서버 값이 늦게 와도 폭이 늘지 않는다.
export default function HudHeader({ game, bagBonus = 0, left, onOpenStats, onOpenQuests, menu }: {
  game: GameState;
  bagBonus?: number;
  /** 오늘 남은 클리어 횟수. 불러오는 중이거나 오프라인이면 null */
  left: { general: number; named: number } | null;
  onOpenStats: () => void;
  /** 의뢰 현황을 눌렀다 - 의뢰 창을 연다 */
  onOpenQuests: () => void;
  /** 메뉴 버튼(펼친 줄 포함). 열 입구가 없으면 아무것도 그리지 않는다 */
  menu: ReactNode;
}) {
  const caps = clearsCaps();
  return (
    <>
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-(--z-overlay) flex items-start gap-1.5
                      mobile:contents">
        <ResourceBar game={game} bagBonus={bagBonus} onOpen={onOpenStats} />
        <QuestStatus general={left?.general ?? UNKNOWN} named={left?.named ?? UNKNOWN}
                     generalCap={caps.general} namedCap={caps.named} onOpen={onOpenQuests} />
      </div>
      <div className="absolute right-3 top-3 z-(--z-card) empty:hidden
                      mobile:relative mobile:right-auto mobile:top-auto mobile:col-start-3 mobile:row-start-1 mobile:mr-1 mobile:my-1">
        {menu}
      </div>
    </>
  );
}
