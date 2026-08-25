-- 0008 롤백 — 제재 컬럼 제거 (적용 전 상태로)
alter table public.saves_current
  drop column if exists restricted;
