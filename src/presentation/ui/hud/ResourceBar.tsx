import { Fragment } from 'react';
import type { GameState } from '../../../game/rules/logic';
import Divider from '../Divider';
import { fmtCompact } from '../format';
import { selectBagStatus } from '../../../features/inventory/model/selectors';
import type { BagLevel } from '../../../features/inventory/model/selectors';
import HeaderFrame from './HeaderFrame';
import HudStat from './HudStat';
import type { HudStatTone } from './HudStat';

// 캔버스 위 반투명 자원 오버레이 (Base·Field 공용). 골드, 명성, 가방 세 칸이다. PC 레이아웃 전용이다.
// 모바일 레이아웃의 헤더는 MobileResourceBar가 맡는다(HudHeader가 레이아웃을 고른다).
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
// **가방은 "수량 (비율%)"**: 채울수록 주황·빨강으로 바뀌어 팔 때를 알린다. 지원 크기(PC 1280x720 이상) 기준 스테이지 폭 896px에서는
// 가장 긴 값도 들어가므로 줄이거나 생략하는 단계가 없다.

/** 가방 경고 단계 → 글자색 (75% 이상 주황, 95% 이상 빨강 계열) */
const BAG_TONE: Record<BagLevel, HudStatTone> = { normal: 'gold', warn: 'orange', danger: 'danger' };

export default function ResourceBar({ game, bagBonus = 0, onOpen }: { game: GameState; bagBonus?: number; onOpen?: () => void }) {
  const bag = selectBagStatus(game, bagBonus);
  const stats = [
    <HudStat key="gold" glyph="coin" label="골드"><b className="font-bold">{fmtCompact(game.gold)}</b></HudStat>,
    <HudStat key="fame" glyph="star" label="명성"><b className="font-bold">{fmtCompact(game.fame)}</b></HudStat>,
    <HudStat key="bag" glyph="fish" label="가방" tone={BAG_TONE[bag.level]}>
      <b className="font-bold">{bag.count}</b> ({bag.percent}%)
    </HudStat>,
  ];
  return (
    <HeaderFrame className="flex items-center px-[18px]">
      {/* 자원 바 클릭 = 스탯창. .hud 클래스는 스타일이 아니라 querySelector 테스트 훅이므로 유지 */}
      <button type="button" aria-label="스탯창 열기" onClick={onOpen}
              className="hud flex items-stretch gap-[18px] cursor-pointer transition hover:brightness-125">
        {stats.map((stat, i) => (
          <Fragment key={stat.key}>
            {i > 0 && <Divider vertical />}
            {stat}
          </Fragment>
        ))}
      </button>
    </HeaderFrame>
  );
}
