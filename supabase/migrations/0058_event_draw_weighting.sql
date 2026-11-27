-- 캐치 이벤트의 추첨 보정 적용값 — 순수 가산 마이그레이션이다.
alter table public.events add column if not exists weighting double precision;
