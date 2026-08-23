/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 버전은 src/version.ts(클라+서버 공유 리터럴)가 단일 근원 — define 주입 폐지 (version.test가 package.json과 동기화 강제)
  //
  // 배포 식별자는 버전과 **다른 값**이다. APP_VERSION은 릴리즈 라벨이라 dev 빌드에서는
  // 안 올린다(roadmap 0.0) — 그래서 낡은 탭 판정에 쓰면 dev 배포 사이에서는 절대 안 걸린다.
  // 배포마다 반드시 달라지는 값이 필요해서 커밋 SHA를 쓴다.
  // Vercel 공식 문서 확인: VERCEL_GIT_COMMIT_SHA는 **빌드·런타임 양쪽**에 제공된다
  // (프로젝트 설정 "Enable access to System Environment Variables"가 켜져 있어야 한다).
  // 여기(빌드)서 번들에 박고, 서버 함수는 런타임에 같은 변수를 읽는다 — 같은 배포면 같은 값.
  // 미설정이면 양쪽 다 'dev'로 떨어져 판정이 무력화될 뿐, 전원 차단 같은 사고는 안 난다.
  define: {
    __BUILD_ID__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev'),
  },
  server: { port: 5199 },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
})
