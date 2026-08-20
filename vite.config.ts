/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // 게임 내 버전 표시 (npm 스크립트로 실행 시 package.json 버전이 주입됨)
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
  server: { port: 5199 },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
})
