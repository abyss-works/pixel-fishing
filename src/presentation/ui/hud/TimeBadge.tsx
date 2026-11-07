// 시간 배지 — 해/달 글리프 + 게임 시계로 시간 흐름을 보여준다.
// 컨테이너 안 어디든 absolute로 얹을 수 있다(바다: 미니맵 왼쪽 위, 거점: 스테이지 오른쪽 위 메뉴 버튼 왼쪽).
// 순수 표시 — 게임 시계 파생만 렌더. 해/달은 어둠 강도(dark) 기준이라
// 낮이어도 저녁(해 질 무렵)부터 달로 바뀌며 서서히 어두워진다.
import PixelIcon from '../PixelIcon';
import { useGameTime } from '../../../features/gameplay/service/useGameTime';
import { cx } from '../cx';
import HudChip from './HudChip';

/** 해/달 전환 임계 — 어둠이 이 값 이상이면 달 (저녁 20시쯤부터) */
const MOON_AT = 0.15;

// 메뉴 버튼 왼쪽 자리: 오른쪽 = 가장자리 12 + 메뉴 버튼 폭 + 간격 6, 위 = 가장자리 12 + (헤더 틀 높이 - 칩 높이 24) / 2.
// 헤더 틀 60px이라 right 78, top 30이다. 모바일 레이아웃에서는 그리지 않는다.
const BESIDE_MENU = 'top-[30px] right-[78px] mobile:hidden';

export default function TimeBadge({ className, besideMenu }: {
  className?: string;
  /** 거점 PC 배치에서 메뉴 버튼 왼쪽에 붙인다(모바일 레이아웃에서는 그리지 않는다). 위치는 헤더 틀 높이에서 나온다 */
  besideMenu?: boolean;
}) {
  const { clock, dark } = useGameTime();
  const night = dark >= MOON_AT;
  return (
    <HudChip size="sm" className={cx('absolute z-(--z-overlay) pointer-events-none', besideMenu && BESIDE_MENU, className)}>
      <PixelIcon glyph={night ? 'moon' : 'sun'} size={11}
                 className={night ? 'text-accent' : 'text-gold'} />
      <span className="pf-accent text-xs leading-none text-text">{clock}</span>
    </HudChip>
  );
}
