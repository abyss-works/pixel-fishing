import { useReducedMotion } from '../../features/display/service/reducedMotion';
import { cx } from './cx';

// 지속 표식 - 메뉴 버튼과 메뉴 줄에 붙는 점과 테두리. 글자를 쓰지 않고, 줄 안에서 자리를 차지하지 않아 표식이 켜지고 꺼져도 줄 크기가 바뀌지 않는다.
// 금색(gold)은 받을 보상과 강조, 빨강(danger)은 읽지 않은 우편이다. 깜빡임(blink, 느리게)과 반짝임(sparkle)은 동작 축소 때 멈추고 정적 색만 남는다.
const MOTION = { blink: 'animate-mark-blink', sparkle: 'animate-mark-sparkle' } as const;

type Motion = keyof typeof MOTION;

function useMotionClass(motion: Motion | undefined): string | undefined {
  const reduced = useReducedMotion();
  return motion && !reduced ? MOTION[motion] : undefined;
}

/** 모서리 점 - 놓일 자리는 부모(relative)의 오른쪽 위다 */
export function MarkDot({ tone, motion, className }: { tone: 'gold' | 'danger'; motion?: Motion; className?: string }) {
  const animation = useMotionClass(motion);
  return (
    <span data-mark={tone} aria-hidden="true"
          className={cx('pointer-events-none absolute right-1 top-1 size-[7px]', tone === 'gold' ? 'bg-gold' : 'bg-danger', animation, className)} />
  );
}

/** 줄을 두르는 금색 테두리 - 부모(relative)를 안쪽으로 덮는다 */
export function MarkBorder({ motion }: { motion?: Motion }) {
  const animation = useMotionClass(motion);
  return <span data-mark="border" aria-hidden="true" className={cx('pointer-events-none absolute inset-0 border border-gold', animation)} />;
}
