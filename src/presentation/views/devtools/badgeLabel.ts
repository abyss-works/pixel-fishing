// 환경 배지 — 지금 보는 화면이 운영이 아님을 알린다. 운영 가드: 운영이거나 알 수 없는 환경이면 띄우지 않는다.
const LABELS: Record<string, string> = {
  preview: 'PREVIEW',
  development: 'DEV BUILD',
  local: 'LOCAL DEV',
};

/** 배포 환경(VERCEL_ENV, 로컬은 local) → 배지 문구. 운영·미상은 null */
export function envBadgeLabel(env: string): string | null {
  return LABELS[env] ?? null;
}
