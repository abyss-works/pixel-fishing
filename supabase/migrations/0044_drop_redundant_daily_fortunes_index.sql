-- (user_id, day) 복합 기본 키 인덱스와 중복되는 daily_fortunes_user_day_idx를 제거한다.
drop index if exists public.daily_fortunes_user_day_idx;
