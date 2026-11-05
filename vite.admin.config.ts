import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config.ts'

// 관리자 대시보드 빌드 — 게임과 같은 설정에 진입점만 바꾼다. 산출물은 /admin/ 아래 경로로 둬
// 정적 서버가 그대로 서빙한다. 파비콘 같은 공개 파일은 같은 오리진의 게임 서버가 준다.
// 개발 서버(npm run dev)는 두 진입점을 함께 서빙한다. 관리자 화면은 http://localhost:5199/admin/ 에서 연다.
export default mergeConfig(base, defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-admin',
    assetsDir: 'admin/assets',
    rolldownOptions: { input: 'admin/index.html' },
  },
}))
