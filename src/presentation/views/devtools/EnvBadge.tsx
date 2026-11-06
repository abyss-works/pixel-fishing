import { cx } from '../../ui/cx';
import { NOTCH_SM } from '../../ui/notch';
import { useDevEnv } from './devEnv';

// 환경 배지 — 스테이징·개발·로컬 빌드임을 게임 스테이지 아래 가운데에 깜빡이며 알린다. 클릭을 가로채지 않는다.
// 환경 이름(위험색)과 빌드 식별자(보조색)를 나란한 두 칸의 노치 꼬리표로 그린다.
// HUD처럼 스테이지(사이드바 제외) 기준으로 놓이고, 낚시 상태 알림보다 아래 층이라 알림을 가리지 않는다.
// 운영이거나 알 수 없는 환경이면 아무것도 그리지 않는다(앱 최상위가 공급한 개발 환경을 읽는다).
const CELL = 'px-2 py-px border border-danger bg-[color-mix(in_oklab,var(--c-bg)_85%,transparent)]';

export default function EnvBadge({ build }: { build: string }) {
  const { label } = useDevEnv();
  if (!label) return null;
  return (
    <div role="status" aria-label={`${label} 빌드 ${build}`}
         className={cx('absolute bottom-0.5 left-1/2 -translate-x-1/2 z-[4] pointer-events-none select-none',
                       'mobile:row-start-2 mobile:row-end-3',
                       'flex pf-accent text-2xs whitespace-nowrap motion-safe:animate-pulse', NOTCH_SM)}>
      <span className={cx(CELL, 'text-danger')}>{label}</span>
      <span className={cx(CELL, 'border-l-0 text-text-dim')}>{build}</span>
    </div>
  );
}
