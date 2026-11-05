-- 편지 처리 표시 — 관리자가 확인이나 답장을 마친 편지에 처리 시각을 남긴다. 비어 있으면 처리 전이다.
-- 관리자 서버 함수만 쓴다. 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.
alter table public.letters
  add column if not exists handled_at timestamptz;
