// 시간 배지 — 해/달 글리프 + 게임 시계로 시간 흐름을 보여준다.
// 컨테이너 안 어디든 absolute로 얹을 수 있다(Field: 미니맵 좌상단, Base: 프레임 우상단).
// 순수 표시 — game/time.ts 파생만 렌더. 해/달은 어둠 강도(dark) 기준이라
// 낮이어도 저녁(해 질 무렵)부터 달로 바뀌며 서서히 어두워진다.
import PixelIcon from '../ui/PixelIcon';
import { useGameTime } from '../hooks/useGameTime';
import { cx } from '../ui/cx';

/** 해/달 전환 임계 — 어둠이 이 값 이상이면 달 (저녁 20시쯤부터) */
const MOON_AT = 0.15;

export default function TimeBadge({ className }: { className?: string }) {
  const { clock, dark } = useGameTime();
  const night = dark >= MOON_AT;
  return (
    <div className={cx(
      'absolute z-(--z-overlay) pointer-events-none flex items-center gap-1.5',
      'px-2 py-0.5 rounded-full border border-line bg-[rgba(10,21,38,0.72)] backdrop-blur-[4px]',
      '[text-shadow:0_1px_2px_rgba(0,0,0,0.6)]', className,
    )}>
      <PixelIcon glyph={night ? 'moon' : 'sun'} size={11}
                 className={night ? 'text-accent' : 'text-gold'} />
      <span className="pf-accent text-xs leading-none tracking-[0.5px] text-text">{clock}</span>
    </div>
  );
}
