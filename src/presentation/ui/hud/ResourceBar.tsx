import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { GameState } from '../../../game/rules/logic';
import Divider from '../Divider';
import { fmtCompact3, fmtNum, fmtRatio } from '../format';
import Tip from '../Tip';
import { selectBagStatus } from '../../../features/inventory/model/selectors';
import type { BagLevel } from '../../../features/inventory/model/selectors';
import HeaderFrame from './HeaderFrame';
import HudStat from './HudStat';
import type { HudStatTone } from './HudStat';

// 캔버스 위 반투명 자원 오버레이 (Base·Field 공용). 골드, 명성, 가방 세 칸이다.
// 배와 낚싯대는 스탯 창에서 본다. 의뢰 현황은 별도 틀(QuestStatus)이다.
//
// **칸마다 [아이콘 | 값] 한 줄.** 이름 글자는 화면에 그리지 않는다. 읽는 이에게는 sr-only 이름, 눈으로 보는 이에게는
// 칸에 마우스를 올릴 때 뜨는 툴팁이 이름을 알린다. 누르면 스탯 창이 열리는 요소라 터치에서는 툴팁을 띄우지 않는다
// (Tip hoverOnly). 키보드와 화면 읽기는 버튼 접근성 이름("스탯창 열기, 골드 ..., 명성 ..., 가방 ...")이 같은 값을 준다. 칸의 모양은 HudStat이 정한다.
//
// **지역 이름은 뺐다**: 지역 탭 상단이 이미 그 지역을 제목으로 달고 있다. 같은 정보를 두
// 곳에 두면 한쪽만 고쳐질 때 갈라진다.
//
// 자원 기호는 이모지 대신 픽셀 아이콘(PixelIcon).
//
// **골드·명성은 유효숫자 3자리 줄임 표기(fmtCompact3)**: 글자 수가 최대 5(99.9K, 1.99M)라 값이 커져도 칸 폭이 거의 그대로다.
// 단위 G는 툴팁의 이름이 대신하고, 정확한 값은 칸 툴팁(호버)과 스탯 창에서 본다.
// **가방은 "수량 (비율%)"**: 채울수록 주황·빨강으로 바뀌어 팔 때를 알린다.
// 자리와 배치는 헤더(HudHeader)가 정한다. 모바일 배치에서는 헤더의 첫 칸을 채우고 세 칸을 한 줄에 둔다.
// 스테이지 폭이 960px 미만이면 간격을 줄이고 칸 사이 구분선을 감춘다.
//
// 렌더링 역할: 골드, 명성, 가방 개수는 필수다. 가방 비율은 스테이지 폭이 440px 미만일 때 생략하고 툴팁으로 넘긴다.
// 기준값 계산. 값 글자의 진행 폭은 픽셀 폰트에서 글자당 약 0.82em이다. 이전 두 줄 칸의 화면 확인에서 안쪽 폭 213px에 21글자가
// 들어간 값으로 구한 추정이고, 한 줄 칸으로 바꾼 뒤 3자리 줄임 표기 4글자 조합(360 폭)에서 scrollWidth = clientWidth = 239로 확인했다.
// 5글자 조합은 아직 화면에서 재지 못했다. 값 글자: 스테이지 폭 380 미만 12px, 380 이상 13px, 960 이상 16px.
// 가장 긴 값은 골드 99.9K 또는 1.99M(5글자), 명성 같은 5글자, 가방 2990(4글자)이다.
//  - 360 폭, 12px: 14글자 x 0.82 x 12 = 138px에 아이콘 3 x 12 + 아이콘 간격 3 x 2 + 칸 사이 2 x 4 = 50px를 더해 188px다.
//    자원 바 안쪽 폭은 360 - (가장자리 4 + 의뢰 현황 틀 84 + 틀 양옆 여백 8 + 메뉴 버튼 자리 44) - 틀 테두리 4 - 안쪽 여백 12 = 204px라 16px 여유가 남는다.
//    13px로 두면 149 + 50 = 199px로 5px 여유뿐이라 360 구간만 12px로 둔다(5글자 값 때문에 4글자 기준 13px에서 낮췄다).
//    의뢰 현황 틀 84px는 테두리 4 + 안쪽 여백 4 + 오목한 칸 여백 4 + 칸 2 x (도형 12 + 간격 2 + 2글자 x 0.82 x 12 = 34px) + 구분선 1 + 간격 4다.
//  - 380 폭, 13px: 149 + 50 = 199px, 의뢰 현황 틀이 88px(칸 2 x 35.3 + 17.4)로 늘어 안쪽 폭은 380 - (4 + 88 + 8 + 44) - 16 = 220px라 21px 여유가 남는다.
//  - 비율을 함께 보이려면 5글자 + 5글자 + 가방 2990 (99%) 10글자 = 20글자 x 0.82 x 13 + 50 = 263px가 필요하다. 440 폭의 안쪽 폭은 280px라
//    17px 여유가 남고, 이보다 좁으면 모자라므로 440px 미만에서 비율을 뺀다(360, 390 폭은 뺀다).
//  - 960px 이상은 글자 16px, 아이콘 24px, 칸 사이 14px와 구분선이 있다. 가장 긴 값(비율 포함 20글자)은 20 x 0.82 x 16 = 262px에
//    아이콘 3 x 24 + 아이콘 간격 6 + 칸 사이 (14 + 구분선 1 + 14) x 2 = 58px, 안쪽 여백 36 + 테두리 4로 438px다. 의뢰 현황 틀은
//    칸 2 x (도형 24 + 간격 2 + 2글자 x 0.82 x 16 = 52px) + 구분선과 간격 17 + 오목한 칸 여백 24 + 틀 여백 14 + 테두리 4로 약 163px다.
//    묶음은 438 + 6 + 163 = 607px로, 스테이지 폭 960에서 묶음 오른쪽 끝은 480 + 304 = 784px, 거점 시계 칩 왼쪽은 804px라 20px 여유다.
//    1920 창(스테이지 약 1536px)에서는 묶음 오른쪽 끝 1072px, 시계 칩 왼쪽 1380px로 여유가 훨씬 크다.

/** 가방 경고 단계 → 글자색 (75% 이상 주황, 95% 이상 빨강 계열) */
const BAG_TONE: Record<BagLevel, HudStatTone> = { normal: 'gold', warn: 'orange', danger: 'danger' };

export default function ResourceBar({ game, bagBonus = 0, onOpen }: { game: GameState; bagBonus?: number; onOpen?: () => void }) {
  const bag = selectBagStatus(game, bagBonus);
  const named = (key: string, tip: ReactNode, cell: ReactNode) => (
    <Tip key={key} wraps plain hoverOnly text={tip}>{cell}</Tip>
  );
  // 접근성 이름에 칸 값(정확한 값)을 싣는다 - 칸 툴팁은 마우스 호버에서만 뜨므로 키보드와 화면 읽기가 같은 정보를 이름으로 얻는다
  const bagText = `${fmtRatio(bag.count, bag.cap)} (${bag.percent}%)`;
  const summary = `골드 ${fmtNum(game.gold)}, 명성 ${fmtNum(game.fame)}, 가방 ${bagText}`;
  const stats = [
    named('gold', `골드 ${fmtNum(game.gold)}`, <HudStat glyph="coin" label="골드"><b className="font-bold">{fmtCompact3(game.gold)}</b></HudStat>),
    named('fame', `명성 ${fmtNum(game.fame)}`, <HudStat glyph="star" label="명성"><b className="font-bold">{fmtCompact3(game.fame)}</b></HudStat>),
    named('bag', `가방 ${bagText}`,
      <HudStat glyph="fish" label="가방" tone={BAG_TONE[bag.level]}>
        <b className="font-bold">{bag.count}</b>
        <span data-omittable className="@max-[440px]:hidden"> ({bag.percent}%)</span>
      </HudStat>),
  ];
  return (
    <HeaderFrame className="flex items-center px-[18px] @max-[960px]:px-1.5
                            mobile:col-start-1 mobile:row-start-1 mobile:ml-1 mobile:my-1 mobile:min-w-0">
      {/* 자원 바 클릭 = 스탯창. .hud 클래스는 스타일이 아니라 querySelector 테스트 훅이므로 유지 */}
      <button type="button" aria-label={`스탯창 열기, ${summary}`} onClick={onOpen}
              className="hud flex items-stretch gap-3.5 cursor-pointer transition hover:brightness-125
                         @max-[960px]:gap-x-1 mobile:w-full mobile:justify-between">
        {stats.map((stat, i) => (
          <Fragment key={stat.key}>
            {i > 0 && <Divider vertical className="@max-[960px]:hidden" />}
            {stat}
          </Fragment>
        ))}
      </button>
    </HeaderFrame>
  );
}
