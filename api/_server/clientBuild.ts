// 낡은 클라이언트 판정 — HTTP 액션(426)과 실시간 채널 연결이 같은 기준을 쓴다.
import { APP_VERSION } from '../../src/version.js';

// 배포 식별자 — vite가 클라 번들에 박는 값과 같은 출처(이미지 빌드 인자 BUILD_ID).
const BUILD_ID = process.env.BUILD_ID ?? 'dev';

/** 클라이언트가 보낸 배포 식별자와 릴리즈 버전. 보내지 않았으면 undefined다 */
export interface ClientBuild { build: string | string[] | undefined; version: string | string[] | undefined }

/** 낡은 탭 판정 — 운영(DEPLOY_ENV=production)은 릴리즈 버전, 그 밖의 배포는 배포 식별자를 대조한다 */
export function staleClient({ build, version }: ClientBuild): boolean {
  return process.env.DEPLOY_ENV === 'production' ? version !== APP_VERSION : build !== BUILD_ID;
}
