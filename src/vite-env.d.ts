/// <reference types="vite/client" />

// vite.config.ts define로 주입되는 배포 식별자 (Vercel 커밋 SHA, 로컬은 'dev')
declare const __BUILD_ID__: string;
