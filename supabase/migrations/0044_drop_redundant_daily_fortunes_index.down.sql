-- 0044 되돌리기 — 제거한 daily_fortunes_user_day_idx를 복구한다.
create index if not exists daily_fortunes_user_day_idx on public.daily_fortunes (user_id, day desc);
