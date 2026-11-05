-- 0022 되돌리기 — 편지 처리 시각 열 삭제. 가산 마이그레이션이라 down은
-- 스키마를 정말 되돌려야 할 때만 쓴다.
alter table public.letters
  drop column if exists handled_at;
