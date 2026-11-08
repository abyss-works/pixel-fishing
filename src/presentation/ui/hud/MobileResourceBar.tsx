import type { ReactNode } from 'react';
import type { GameState } from '../../../game/rules/logic';
import { fmtCompact3 } from '../format';
import PixelIcon from '../PixelIcon';
import Tip from '../Tip';
import { selectBagStatus } from '../../../features/inventory/model/selectors';
import BagMeter from './BagMeter';
import MobileHeaderFrame from './MobileHeaderFrame';
import MobileHudStat from './MobileHudStat';
import { resourceText } from './resourceText';

// 모바일 레이아웃의 헤더 자원 바. PC 레이아웃의 자원 바(ResourceBar)와 같은 다섯 칸을 두 행으로 둔다.
// 1행은 골드, 명성, 배, 낚싯대 네 칸이고, 2행은 가방 아이콘, 게이지, 백분율이다.
//
// **1행의 칸마다 [아이콘 | 값] 한 줄.** 이름 글자는 화면에 그리지 않는다. 읽는 이에게는 sr-only 이름, 눈으로 보는 이에게는
// 칸에 마우스를 올릴 때 뜨는 툴팁이 이름을 알린다. 누르면 스탯 창이 열리는 요소라 터치에서는 툴팁을 띄우지 않는다
// (Tip hoverOnly). 키보드와 화면 읽기는 버튼 접근성 이름("스탯창 열기, 골드 ..., 명성 ..., 배 ..., 낚싯대 ..., 가방 ...")이 같은 값을 준다.
// 배 칸 값은 이름 대신 낚싯대 칸과 같은 Lv.<티어> 형식이고, 배 이름은 툴팁과 접근성 이름에 있다.
// **2행의 가방은 게이지와 백분율만**: 수량은 툴팁과 스탯 창에서 본다. 게이지는 남는 폭을 채우므로 비율을 생략하는 단계가 없다.
// 칸 사이 구분선은 없다. 문구는 resourceText가 만든다.
//
// **골드·명성은 유효숫자 3자리 줄임 표기(fmtCompact3)**: 글자 수가 최대 5(99.9K, 1.99M)라 값이 커져도 칸 폭이 거의 그대로다.
// 자리와 배치는 헤더(HudHeader)가 정한다. 자원 바가 남는 폭을 쓰고, 메뉴 버튼은 이 틀의 세로 가운데에 놓인다.
//
// 1행 폭 계산. 값 글자의 진행 폭은 픽셀 폰트에서 글자당 약 0.82em이다(추정. 이전 한 줄 칸에서 4글자 조합 360 폭의 scrollWidth = clientWidth로 확인).
// 가장 긴 값은 골드 99.9K 또는 1.99M(5글자), 명성 같은 5글자, 배 Lv.8(4글자), 낚싯대 Lv.99(5글자)다.
//  - 360 폭, 12px: 19글자 x 0.82 x 12 = 187px에 아이콘 4 x 12 + 아이콘 간격 4 x 2 + 칸 사이 3 x 4 = 68px를 더해 255px다.
//    자원 바 안쪽 폭은 360 - (가장자리 4 + 메뉴 버튼 자리 44) - 틀 테두리 4 - 안쪽 여백 12 = 296px라 41px 여유가 남는다.
//  - 380 폭, 13px: 203 + 68 = 271px, 안쪽 폭 316px로 45px 여유가 남는다.

export default function MobileResourceBar({ game, bagBonus = 0, onOpen }: { game: GameState; bagBonus?: number; onOpen?: () => void }) {
  const bag = selectBagStatus(game, bagBonus);
  const text = resourceText(game, bagBonus);
  const named = (key: string, tip: ReactNode, cell: ReactNode, className?: string) => (
    <Tip key={key} wraps plain hoverOnly text={tip} className={className}>{cell}</Tip>
  );
  const stats = [
    named('gold', text.gold, <MobileHudStat glyph="coin" label="골드"><b className="font-bold">{fmtCompact3(game.gold)}</b></MobileHudStat>),
    named('fame', text.fame, <MobileHudStat glyph="star" label="명성"><b className="font-bold">{fmtCompact3(game.fame)}</b></MobileHudStat>),
    named('boat', text.boat, <MobileHudStat glyph="boat" label="배"><b className="font-bold">{text.boatValue}</b></MobileHudStat>),
    named('rod', text.rod, <MobileHudStat glyph="rod" label="낚싯대"><b className="font-bold">{text.rodValue}</b></MobileHudStat>),
  ];
  return (
    <MobileHeaderFrame className="flex items-center px-1.5 py-1
                            mobile:col-start-1 mobile:row-start-1 mobile:ml-1 mobile:my-1 mobile:min-w-0">
      {/* 자원 바 클릭 = 스탯창. .hud 클래스는 스타일이 아니라 querySelector 테스트 훅이므로 유지 */}
      <button type="button" aria-label={`스탯창 열기, ${text.summary}`} onClick={onOpen}
              className="hud flex w-full flex-col gap-1 cursor-pointer transition hover:brightness-125">
        <span className="flex items-center justify-between gap-x-1">{stats}</span>
        {named('bag', text.bag, (
          <span className="flex items-center gap-1">
            <PixelIcon glyph="fish" className="size-3 shrink-0 text-text-dim" />
            <span className="sr-only">가방 </span>
            <BagMeter percent={bag.percent} level={bag.level} gaugeClass="flex-1 min-w-6 h-1.5" percentClass="text-[12px] @min-[380px]:text-[13px]" />
          </span>
        ), 'block w-full')}
      </button>
    </MobileHeaderFrame>
  );
}
