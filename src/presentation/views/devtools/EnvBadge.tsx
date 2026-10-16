import { envBadgeLabel } from './badgeLabel';

// 환경 배지 — 스테이징·개발·로컬 빌드임을 화면 위 가운데에 깜빡이며 알린다. 클릭을 가로채지 않는다.
// 운영이거나 알 수 없는 환경이면 아무것도 그리지 않는다(envBadgeLabel이 가드).
export default function EnvBadge({ env, build }: { env: string; build: string }) {
  const label = envBadgeLabel(env);
  if (!label) return null;
  return (
    <div role="status" aria-label={`${label} 빌드`}
         className="fixed top-1 left-1/2 -translate-x-1/2 z-[70] pointer-events-none select-none
                    pf-accent text-[0.9rem] px-2.5 py-[3px] border border-danger text-danger bg-bg/80 rounded-sm
                    motion-safe:animate-pulse">
      {label} · {build}
    </div>
  );
}
