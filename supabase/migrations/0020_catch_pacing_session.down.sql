-- 0020 되돌리기 — 캐치 간격·활성 창 열 삭제. 가산 마이그레이션이라 down은
-- 스키마를 정말 되돌려야 할 때만 쓴다.
alter table public.saves_current
  drop column if exists last_catch_at,
  drop column if exists active_client;
