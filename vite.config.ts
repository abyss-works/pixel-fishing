/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 버전은 src/version.ts(클라+서버 공유 리터럴)가 단일 근원 — define 주입 폐지 (version.test가 package.json과 동기화 강제)
  server: { port: 5199 },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
})
