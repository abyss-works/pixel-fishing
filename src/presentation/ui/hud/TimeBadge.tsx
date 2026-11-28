// 시계 - 해/달 글리프 + 게임 시계로 시간 흐름을 보여준다.
// 미니맵 오른쪽 아래에 겹치는 칩이다(미니맵을 숨기면 그 자리 한 줄). 자리는 HUD 배치(HudLayout)가 정한다.
// 순수 표시 - 게임 시계 파생만 렌더. 해/달은 낮/밤 판정(phase)을 그대로 따라
// 밤 구간(22:00~06:00) 전체에서 달 아이콘, 낮 구간(06:00~22:00) 전체에서 해 아이콘을 보인다.
import PixelIcon from '../PixelIcon';
import { useGameTime } from '../../../features/gameplay/service/useGameTime';
import HudChip from './HudChip';

export default function TimeBadge() {
  const { clock, phase } = useGameTime();
  const night = phase === 'night';
  return (
    <HudChip>
      <PixelIcon glyph={night ? 'moon' : 'sun'} size={11}
                 className={night ? 'text-accent' : 'text-gold'} />
      <span className="pf-accent leading-none text-text">{clock}</span>
    </HudChip>
  );
}
