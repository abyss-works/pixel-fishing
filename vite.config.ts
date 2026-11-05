import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 버전은 버전 상수(클라+서버 공유 리터럴)가 단일 근원 — define 주입 폐지 (version.test가 설정 정보와 동기화 강제)
  //
  // 배포 식별자는 버전과 **다른 값**이다. APP_VERSION은 릴리즈 라벨이라 dev 빌드에서는
  // 안 올린다(roadmap 0.0) — 그래서 낡은 탭 판정에 쓰면 dev 배포 사이에서는 절대 안 걸린다.
  // 배포마다 반드시 달라지는 값이 필요해서 커밋 SHA를 쓴다. 운영 서버만 릴리즈 버전으로 판정한다.
  // 이미지 빌드가 BUILD_ID(커밋 SHA)를 빌드와 런타임 양쪽 환경 변수로 넘긴다.
  // 여기(빌드)서 번들에 박고, 서버는 런타임에 같은 변수를 읽는다 — 같은 이미지면 같은 값.
  // 미설정이면 양쪽 다 'dev'로 떨어져 판정이 무력화될 뿐, 전원 차단 같은 사고는 안 난다.
  // 배포 환경(DEPLOY_ENV: production/preview/development)도 같은 방식으로 박는다 — 환경 배지가 본다.
  // 값이 없는 빌드(로컬)는 'local'이다.
  define: {
    __BUILD_ID__: JSON.stringify(process.env.BUILD_ID ?? 'dev'),
    __DEPLOY_ENV__: JSON.stringify(process.env.DEPLOY_ENV ?? 'local'),
  },
  server: { port: 5199 },
  test: {
    setupFiles: './src/test-setup.ts',
    // DOM이 필요 없는 테스트(게임 규칙·서버·도구)는 node 환경으로 돌린다. jsdom 준비 비용이 테스트 시간의 대부분이다.
    // 실제 Postgres가 필요한 테스트는 test:db(vitest.db.config.ts)가 따로 실행한다. 작업용 워크트리는 검사 대상이 아니다.
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/game/**/*.test.ts', 'src/shared/**/*.test.ts', 'api/**/*.test.ts', 'tools/**/*.test.ts'],
          exclude: [...configDefaults.exclude, '**/*.db.test.ts', '**/.worktrees/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['**/*.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude, '**/*.db.test.ts', '**/.worktrees/**',
            'src/game/**', 'src/shared/**', 'api/**', 'tools/**'],
        },
      },
    ],
  },
})
