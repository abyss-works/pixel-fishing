import type { ReactNode } from 'react';
import type { GameState } from '../../../game/rules/logic';
import MobileQuestStatus from '../../ui/hud/MobileQuestStatus';
import MobileResourceBar from '../../ui/hud/MobileResourceBar';
import QuestStatus from '../../ui/hud/QuestStatus';
import ResourceBar from '../../ui/hud/ResourceBar';
import type { ClearsStatus } from '../../../features/bounty/model/panel';
import { useMobileLayout } from '../useMobileLayout';

/** 서버 값(오늘 남은 클리어)이 아직 없을 때 PC 의뢰 현황에 보이는 수 */
const UNKNOWN = 0;

// 상단 - 자원 바, 의뢰 현황, 메뉴 버튼 세 덩어리를 각각 별도 틀로 늘어놓는다. 배와 낚싯대는 두지 않는다(스탯 창에서 본다).
// PC 레이아웃: 스테이지 위쪽 가운데에 자원 바(골드, 명성, 가방, 칸마다 라벨 위 값 아래)와 의뢰 현황을 나란히 두고,
// 메뉴 버튼은 오른쪽 위 모서리에 둔다. 세 틀의 높이는 60px로 같고, 스테이지 폭에 따라 줄어드는 단계는 없다.
// 모바일 레이아웃: 스테이지 격자의 1행에 세 덩어리를 왼쪽부터 놓고(높이 40px), 자원 바와 의뢰 현황은 [아이콘 | 값] 한 줄로 간소화한다.
// 두 레이아웃 모두 의뢰 현황을 누르면 의뢰 창이, 자원 바를 누르면 스탯 창이 열린다.
// 메뉴 버튼 자리는 한 단 높은 층(card)이라, 펼친 줄이 게임 영역의 카드 묶음(overlay) 위에 놓인다.
// 칸은 처음부터 모두 그려, 서버 값이 늦게 와도 폭이 늘지 않는다. PC 구성은 사용자가 바꾸라고 하지 않는 한 바꾸지 않는다.
export default function HudHeader({ game, bagBonus = 0, clears, onOpenStats, onOpenQuests, menu }: {
  game: GameState;
  bagBonus?: number;
  /** 오늘 클리어 현황(남은 횟수와 한도). 남은 횟수는 불러오는 중이거나 오프라인이면 null */
  clears: ClearsStatus;
  onOpenStats: () => void;
  /** 의뢰 현황을 눌렀다 - 의뢰 창을 연다 */
  onOpenQuests: () => void;
  /** 메뉴 버튼(펼친 줄 포함). 열 입구가 없으면 아무것도 그리지 않는다 */
  menu: ReactNode;
}) {
  const mobile = useMobileLayout();
  return (
    <>
      {mobile ? (
        <>
          <MobileResourceBar game={game} bagBonus={bagBonus} onOpen={onOpenStats} />
          <MobileQuestStatus general={clears.left?.general ?? null} named={clears.left?.named ?? null}
                             generalCap={clears.caps.general} namedCap={clears.caps.named} onOpen={onOpenQuests} />
        </>
      ) : (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-(--z-overlay) flex items-start gap-1.5">
          <ResourceBar game={game} bagBonus={bagBonus} onOpen={onOpenStats} />
          <QuestStatus general={clears.left?.general ?? UNKNOWN} named={clears.left?.named ?? UNKNOWN} onOpen={onOpenQuests} />
        </div>
      )}
      <div className="absolute right-3 top-3 z-(--z-card) empty:hidden
                      mobile:relative mobile:right-auto mobile:top-auto mobile:col-start-3 mobile:row-start-1 mobile:mr-1 mobile:my-1">
        {menu}
      </div>
    </>
  );
}
