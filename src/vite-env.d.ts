/// <reference types="vite/client" />

// Vite define 설정으로 주입되는 배포 식별자 (Vercel 커밋 SHA, 로컬은 'dev')
declare const __BUILD_ID__: string;
