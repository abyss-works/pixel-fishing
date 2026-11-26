-- 0041 되돌리기 — 길드 자유 강화 누적 초기화 횟수 열을 지운다.
alter table public.saves_current drop column if exists guild_enhance_reset_count;
