/// <reference types="vite/client" />

// Vite define 설정으로 주입되는 배포 식별자 (이미지 빌드의 커밋 SHA, 로컬은 'dev')
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  /** '1'이면 스테이징·운영 서버(/api)에 붙는 빌드다. 그 밖에는 로컬 모드다 */
  readonly VITE_CLOUD?: string;
}
