-- 0058 되돌림 — events의 추첨 보정 적용값 열을 제거한다.
alter table public.events drop column if exists weighting;
