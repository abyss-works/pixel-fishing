// 낡은 클라이언트 판정 — HTTP 액션(426)과 실시간 채널 연결이 같은 기준을 쓴다.
import { APP_VERSION } from '../../src/version.js';

// 배포 식별자 — vite가 클라 번들에 박는 값과 같은 출처(이미지 빌드 인자 BUILD_ID).
const BUILD_ID = process.env.BUILD_ID ?? 'dev';

/** 클라이언트가 보낸 배포 식별자와 릴리즈 버전. 보내지 않았으면 undefined다 */
export interface ClientBuild { build: string | string[] | undefined; version: string | string[] | undefined }

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

function parseSemver(raw: unknown): readonly [number, number, number] | null {
  if (typeof raw !== 'string') return null;
  const match = SEMVER_RE.exec(raw);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

/** 낡은 탭 판정 — 운영(DEPLOY_ENV=production)은 clientVersion < APP_VERSION일 때만 426(롤링 배포 중 신버전 허용), 그 밖의 배포는 배포 식별자를 대조한다 */
export function staleClient({ build, version }: ClientBuild): boolean {
  if (process.env.DEPLOY_ENV !== 'production') return build !== BUILD_ID;
  const client = parseSemver(version);
  if (!client) return true;
  const server = parseSemver(APP_VERSION);
  if (!server) return version !== APP_VERSION;
  return compareSemver(client, server) < 0;
}
