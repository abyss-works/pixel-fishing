-- 0037 되돌리기 — 카운터 표와 events.counted 열을 되돌린다. 카운터 값은 복구되지 않는다.
alter table public.events drop column if exists counted;
drop table if exists public.achievement_counters;
