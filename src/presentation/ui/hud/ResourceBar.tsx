import { Fragment } from 'react';
import type { GameState } from '../../../game/rules/logic';
import Divider from '../Divider';
import Tip from '../Tip';
import { fmtCompact } from '../format';
import { selectBagStatus } from '../../../features/inventory/model/selectors';
import BagMeter from './BagMeter';
import HeaderFrame from './HeaderFrame';
import HudStat from './HudStat';
import ResourceRows from './ResourceRows';
import { resourceText } from './resourceText';

// 캔버스 위 반투명 자원 오버레이 (Base·Field 공용). PC 레이아웃의 헤더 자원 바다. 모바일 레이아웃의 헤더는 MobileResourceBar가 맡는다(HudHeader가 레이아웃을 고른다).
// 크기와 단계는 헤더 행이 정한 CSS 변수(headerTier)를 읽고, 이 파일은 단계 경계를 모른다.
//
// **기본, 간격 축소 단계(wide 본문)**: 골드, 명성, 배, 낚싯대, 가방의 다섯 칸을 한 행에 두고 칸 사이를 세로 구분선으로 가른다.
// 칸마다 2행: 위가 아이콘과 이름(13px), 아래가 값(17px)이고 칸마다 가운데 정렬이다
// (이름과 값의 길이가 서로 달라 왼쪽 정렬하면 두 줄이 어긋나 보인다). 칸의 모양은 HudStat이 정한다. 높이는 60px이다.
// 칸 사이 간격, 틀 안쪽 좌우 여백, 가방 게이지 폭만 단계 변수로 줄고 라벨과 글자 크기는 그대로다.
// **두 행 단계(rows 본문)**: 모바일 레이아웃 헤더와 같은 구성이라 ResourceRows를 그대로 쓴다.
// 두 본문은 같은 버튼 안에 있고 단계 변수가 display를 골라 하나만 보이므로 버튼, 접근성 이름, 스탯 창 진입은 하나다.
//
// **지역 이름은 뺐다**: 지역 탭 상단이 이미 그 지역을 제목으로 달고 있다. 같은 정보를 두 곳에 두면 한쪽만 고쳐질 때 갈라진다.
// 자원 기호는 이모지 대신 픽셀 아이콘(PixelIcon).
//
// **wide 본문의 골드·명성은 줄임 표기(fmtCompact)**: 값이 커져도 칸 폭이 거의 그대로다. 단위 G는 이름 줄이 대신한다.
// 배 칸 값은 배 이름, 낚싯대 칸 값은 Lv.<레벨>이다.
// **가방은 게이지와 백분율(15px)만**: 수량은 칸의 툴팁(마우스 호버)과 스탯 창에서 본다.
// 누르면 스탯 창이 열리는 요소라 터치에서는 툴팁을 띄우지 않고(Tip hoverOnly), 키보드와 화면 읽기는 버튼 접근성 이름이 같은 값을 준다.

export default function ResourceBar({ game, bagBonus = 0, onOpen }: { game: GameState; bagBonus?: number; onOpen?: () => void }) {
  const bag = selectBagStatus(game, bagBonus);
  const text = resourceText(game, bagBonus);
  const stats = [
    <HudStat key="gold" glyph="coin" label="골드"><b className="font-bold">{fmtCompact(game.gold)}</b></HudStat>,
    <HudStat key="fame" glyph="star" label="명성"><b className="font-bold">{fmtCompact(game.fame)}</b></HudStat>,
    <HudStat key="boat" glyph="boat" label="배"><b className="font-bold">{text.boatName}</b></HudStat>,
    <HudStat key="rod" glyph="rod" label="낚싯대"><b className="font-bold">{text.rodValue}</b></HudStat>,
    <Tip key="bag" wraps plain hoverOnly text={text.bag}>
      <HudStat glyph="fish" label="가방">
        <span className="flex items-center gap-1.5 h-[17px]">
          <BagMeter percent={bag.percent} level={bag.level} gaugeClass="w-(--hdr-gauge) h-2" percentClass="text-[15px] min-w-[3.4em]" />
        </span>
      </HudStat>
    </Tip>,
  ];
  return (
    <HeaderFrame className="flex items-center px-(--hdr-pad) py-(--hdr-pad-y)">
      {/* 자원 바 클릭 = 스탯창. .hud 클래스는 스타일이 아니라 querySelector 테스트 훅이므로 유지 */}
      <button type="button" aria-label={`스탯창 열기, ${text.summary}`} onClick={onOpen}
              className="hud block w-full cursor-pointer transition hover:brightness-125">
        <span className="[display:var(--hdr-wide)] items-stretch gap-(--hdr-gap)">
          {stats.map((stat, i) => (
            <Fragment key={stat.key}>
              {i > 0 && <Divider vertical />}
              {stat}
            </Fragment>
          ))}
        </span>
        <span className="[display:var(--hdr-rows)] w-full flex-col gap-1">
          <ResourceRows game={game} text={text} bag={bag} />
        </span>
      </button>
    </HeaderFrame>
  );
}
