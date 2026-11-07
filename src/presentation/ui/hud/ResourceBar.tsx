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
// (Tip wraps가 누르기를 막는다). 칸의 모양은 HudStat이 정한다.
//
// **지역 이름은 뺐다**: 지역 탭 상단이 이미 그 지역을 제목으로 달고 있다. 같은 정보를 두
// 곳에 두면 한쪽만 고쳐질 때 갈라진다.
//
// 자원 기호는 이모지 대신 픽셀 아이콘(PixelIcon).
//
// **골드·명성은 유효숫자 3자리 줄임 표기(fmtCompact3)**: 글자 수가 최대 4(999K)라 값이 커져도 칸 폭이 거의 그대로다.
// 단위 G는 툴팁의 이름이 대신하고, 정확한 값은 칸 툴팁(호버)과 스탯 창에서 본다.
// **가방은 "수량 (비율%)"**: 채울수록 주황·빨강으로 바뀌어 팔 때를 알린다.
// 자리와 배치는 헤더(HudHeader)가 정한다. 모바일 배치에서는 헤더의 첫 칸을 채우고 세 칸을 한 줄에 둔다.
// 스테이지 폭이 960px 미만이면 간격을 줄이고 칸 사이 구분선을 감춘다.
//
// 렌더링 역할: 골드, 명성, 가방 개수는 필수다. 가방 비율은 스테이지 폭이 440px 미만일 때 생략하고 툴팁으로 넘긴다.
// 기준값 계산(값 글자의 진행 폭은 픽셀 폰트에서 글자당 약 0.82em, 화면 확인 실측 213px 안쪽 폭에 21글자가 들어간 값에서 구한 추정,
// 이후 360 폭 최대 값에서 scrollWidth = clientWidth = 239로 확인):
//  - 360 폭, 글자 13px: 가장 긴 값 골드 999K(4글자), 명성 999K(4), 가방 2990(4)은 12글자 x 0.82 x 13 = 128px,
//    아이콘 3 x 12 + 아이콘 간격 3 x 2 + 칸 사이 2 x 6 = 54px로 182px다. 자원 바 안쪽 폭은 360 - (가장자리 4 + 의뢰 현황 틀 99 + 메뉴 버튼 44)
//    - 틀 테두리 4 - 안쪽 여백 16 = 193px라 11px 여유가 남는다(의뢰 현황 틀은 일반 10, 네임드 3 두 칸: 도형 10 + 간격 2 + 2글자 x 0.82 x 13 = 33px씩).
//  - 비율을 함께 보이려면 4자리 가방과 비율(2990 (99%) 10글자)로 골드 4 + 명성 4 + 10 = 18글자 x 0.82 x 13 + 54 = 246px가 필요하다.
//    안쪽 폭이 그만큼 되는 가장 좁은 스테이지는 약 414px라 여유를 두어 440px 미만에서 비율을 뺀다(360, 390 폭은 뺀다).
//  - 960px 이상은 글자 16px, 아이콘 24px, 칸 사이 구분선이 있다. 가장 긴 값(비율 포함 18글자)은 18 x 0.82 x 16 = 236px에
//    아이콘 3 x 24 + 아이콘 간격 6 + 칸 사이 (18 + 구분선 1 + 18) x 2 = 74px, 안쪽 여백 36 + 테두리 4로 428px다. 의뢰 현황 틀은
//    (도형 15 + 간격 2 + 2글자 x 0.82 x 16 = 43px) x 2 + 구분선과 간격 21 + 안쪽 여백 24 + 틀 여백 14 + 테두리 4로 약 149px다.
//    묶음은 428 + 6 + 149 = 583px로, 거점 시계 칩과 겹치지 않는 한도(HeaderFrame 주석의 585px, 스테이지 폭 960에서 647px)
//    안이다. 스테이지 폭 960에서 묶음 오른쪽 끝은 480 + 292 = 772px, 시계 칩 왼쪽은 804px로 32px 여유이고, 1920 창(스테이지 약 1536px)에서는
//    시계 칩 왼쪽이 1380px이라 여유가 훨씬 크다.

/** 가방 경고 단계 → 글자색 (75% 이상 주황, 95% 이상 빨강 계열) */
const BAG_TONE: Record<BagLevel, HudStatTone> = { normal: 'gold', warn: 'orange', danger: 'danger' };

export default function ResourceBar({ game, bagBonus = 0, onOpen }: { game: GameState; bagBonus?: number; onOpen?: () => void }) {
  const bag = selectBagStatus(game, bagBonus);
  const named = (key: string, tip: ReactNode, cell: ReactNode) => (
    <Tip key={key} wraps plain text={tip}>{cell}</Tip>
  );
  const stats = [
    named('gold', `골드 ${fmtNum(game.gold)}`, <HudStat glyph="coin" label="골드"><b className="font-bold">{fmtCompact3(game.gold)}</b></HudStat>),
    named('fame', `명성 ${fmtNum(game.fame)}`, <HudStat glyph="star" label="명성"><b className="font-bold">{fmtCompact3(game.fame)}</b></HudStat>),
    named('bag', `가방 ${fmtRatio(bag.count, bag.cap)} (${bag.percent}%)`,
      <HudStat glyph="fish" label="가방" tone={BAG_TONE[bag.level]}>
        <b className="font-bold">{bag.count}</b>
        <span data-omittable className="@max-[440px]:hidden"> ({bag.percent}%)</span>
      </HudStat>),
  ];
  return (
    <HeaderFrame className="flex items-center px-[18px] @max-[960px]:px-2
                            mobile:col-start-1 mobile:row-start-1 mobile:ml-1 mobile:my-1 mobile:min-w-0">
      {/* 자원 바 클릭 = 스탯창. .hud 클래스는 스타일이 아니라 querySelector 테스트 훅이므로 유지 */}
      <button type="button" aria-label="스탯창 열기" onClick={onOpen}
              className="hud flex items-stretch gap-[18px] cursor-pointer transition hover:brightness-125
                         @max-[960px]:gap-x-1.5 mobile:w-full mobile:justify-between">
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
