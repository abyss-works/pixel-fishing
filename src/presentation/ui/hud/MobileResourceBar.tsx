import type { GameState } from '../../../game/rules/logic';
import { selectBagStatus } from '../../../features/inventory/model/selectors';
import MobileHeaderFrame from './MobileHeaderFrame';
import ResourceRows from './ResourceRows';
import { resourceText } from './resourceText';

// 모바일 레이아웃의 헤더 자원 바. PC 레이아웃의 자원 바(ResourceBar)와 같은 다섯 칸을 두 행으로 둔다. 두 행의 구성과 글자 크기, 숫자 표기는 ResourceRows가 정한다.
// 자리와 배치는 헤더(HudHeader)가 정한다. 자원 바가 남는 폭을 쓰고, 메뉴 버튼은 이 틀의 세로 가운데에 놓인다.
// 누르면 스탯 창이 열린다. 키보드와 화면 읽기는 버튼 접근성 이름("스탯창 열기, 골드 ..., 명성 ..., 배 ..., 낚싯대 ..., 가방 ...")이 같은 값을 준다.

export default function MobileResourceBar({ game, bagBonus = 0, onOpen }: { game: GameState; bagBonus?: number; onOpen?: () => void }) {
  const bag = selectBagStatus(game, bagBonus);
  const text = resourceText(game, bagBonus);
  return (
    <MobileHeaderFrame className="flex items-center px-1.5 py-1
                            mobile:relative mobile:top-[var(--keyboard-top,0px)] mobile:z-(--z-chrome) mobile:col-start-1 mobile:row-start-1 mobile:ml-1 mobile:my-1 mobile:min-w-0">
      {/* 자원 바 클릭 = 스탯창. .hud 클래스는 스타일이 아니라 querySelector 테스트 훅이므로 유지 */}
      <button type="button" aria-label={`스탯창 열기, ${text.summary}`} onClick={onOpen}
              className="hud flex w-full flex-col gap-1 cursor-pointer transition hover:brightness-125">
        <ResourceRows game={game} text={text} bag={bag} />
      </button>
    </MobileHeaderFrame>
  );
}
