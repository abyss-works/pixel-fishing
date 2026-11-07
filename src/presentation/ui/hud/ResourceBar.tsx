import { Fragment } from 'react';
import type { GameState } from '../../../game/rules/logic';
import Divider from '../Divider';
import { fmtCompact } from '../format';
import { cx } from '../cx';
import Tip from '../Tip';
import { useOmitted } from '../useOmitted';
import { selectBagStatus } from '../../../features/inventory/model/selectors';
import type { BagLevel } from '../../../features/inventory/model/selectors';
import HeaderFrame from './HeaderFrame';
import HudStat from './HudStat';
import type { HudStatTone } from './HudStat';

// 캔버스 위 반투명 자원 오버레이 (Base·Field 공용). 골드, 명성, 가방 세 칸이다.
// 배와 낚싯대는 스탯 창에서 본다. 의뢰 현황은 별도 틀(QuestStatus)이다.
//
// **칸마다 2행: 위가 이름, 아래가 값.** 바 전체로는 한 줄이고, 칸마다 가운데 정렬이다
// (이름과 값의 길이가 서로 달라 왼쪽 정렬하면 두 줄이 어긋나 보인다). 칸의 모양은 HudStat이 정한다.
//
// **지역 이름은 뺐다**: 지역 탭 상단이 이미 그 지역을 제목으로 달고 있다. 같은 정보를 두
// 곳에 두면 한쪽만 고쳐질 때 갈라진다.
//
// 자원 기호는 이모지 대신 픽셀 아이콘(PixelIcon).
//
// **골드·명성은 줄임 표기(fmtCompact)**: 값이 커져도 칸 폭이 거의 그대로다. 단위 G는 이름 줄이 대신한다.
// **가방은 "수량 (비율%)"**: 채울수록 주황·빨강으로 바뀌어 팔 때를 알린다.
// 자리와 배치는 헤더(HudHeader)가 정한다. 모바일 배치에서는 헤더의 첫 칸을 채우고 세 칸을 한 줄에 둔다.
// 스테이지 폭이 960px 미만이면 크기와 간격을 줄이고 칸 사이 구분선을 감춘다.
// 렌더링 역할: 골드, 명성, 가방 개수는 필수다. 가방 비율은 개수가 네 자리(1000 이상)이고 스테이지 폭이 380px 미만일 때 생략하고
// 가방 칸에 마우스를 올릴 때만 툴팁으로 넘긴다(누르면 스탯 창이 열리는 요소라 터치에서는 툴팁을 띄우지 않는다).
// 380px과 1000: 360 폭에서 한 칸 폭은 자원 바 안쪽 213px이고, 가방 472 (15%)처럼 세 자리 개수는 골드, 명성 999.9K와 함께
// 4px 여유로 들어간다. 네 자리(2990 (99%))는 내용 219px로 6px 넘친다(화면 확인 실측). 390 폭은 30px 여유가 있다.
// 그래서 넘치는 폭(360)과 들어가는 폭(390) 사이인 380px 미만에서 네 자리 개수만 비율을 뺀다.

/** 가방 경고 단계 → 글자색 (75% 이상 주황, 95% 이상 빨강 계열) */
const BAG_TONE: Record<BagLevel, HudStatTone> = { normal: 'gold', warn: 'orange', danger: 'danger' };

export default function ResourceBar({ game, bagBonus = 0, onOpen }: { game: GameState; bagBonus?: number; onOpen?: () => void }) {
  const bag = selectBagStatus(game, bagBonus);
  const { ref: percentRef, isOmitted } = useOmitted<HTMLSpanElement>();
  // 비율을 생략할 만큼 개수가 긴 경우
  const longCount = bag.count >= 1000;
  const stats = [
    <HudStat key="gold" glyph="coin" label="골드"><b className="font-bold">{fmtCompact(game.gold)}</b></HudStat>,
    <HudStat key="fame" glyph="star" label="명성"><b className="font-bold">{fmtCompact(game.fame)}</b></HudStat>,
    <Tip key="bag" wraps plain onlyIf={isOmitted} text={`가방 ${bag.count}/${bag.cap} (${bag.percent}%)`}>
      <HudStat glyph="fish" label="가방" tone={BAG_TONE[bag.level]}>
        <b className="font-bold">{bag.count}</b>
        <span ref={percentRef} data-omittable className={cx(longCount && '@max-[380px]:hidden')}> ({bag.percent}%)</span>
      </HudStat>
    </Tip>,
  ];
  return (
    <HeaderFrame className="flex items-center px-[18px] @max-[960px]:px-2
                            mobile:col-start-1 mobile:row-start-1 mobile:ml-1 mobile:my-1 mobile:min-w-0">
      {/* 자원 바 클릭 = 스탯창. .hud 클래스는 스타일이 아니라 querySelector 테스트 훅이므로 유지 */}
      <button type="button" aria-label="스탯창 열기" onClick={onOpen}
              className="hud flex items-stretch gap-[18px] cursor-pointer transition hover:brightness-125
                         @max-[960px]:gap-x-2.5 mobile:w-full mobile:justify-between">
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
