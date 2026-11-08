// 시계 - 해/달 글리프 + 게임 시계로 시간 흐름을 보여준다.
// 미니맵 바로 위 칩 줄(접속 칩, 활성 미끼 칩 뒤)의 칩이다. 자리는 HUD 배치(HudLayout)가 정한다.
// 순수 표시 - 게임 시계 파생만 렌더. 해/달은 어둠 강도(dark) 기준이라
// 낮이어도 저녁(해 질 무렵)부터 달로 바뀌며 서서히 어두워진다.
import PixelIcon from '../PixelIcon';
import { useGameTime } from '../../../features/gameplay/service/useGameTime';
import HudChip from './HudChip';

/** 해/달 전환 임계 - 어둠이 이 값 이상이면 달 (저녁 20시쯤부터) */
const MOON_AT = 0.15;

export default function TimeBadge() {
  const { clock, dark } = useGameTime();
  const night = dark >= MOON_AT;
  return (
    <HudChip size="sm">
      <PixelIcon glyph={night ? 'moon' : 'sun'} size={11}
                 className={night ? 'text-accent' : 'text-gold'} />
      <span className="pf-accent text-xs leading-none text-text">{clock}</span>
    </HudChip>
  );
}
