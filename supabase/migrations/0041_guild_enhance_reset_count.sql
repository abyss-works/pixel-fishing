-- 길드 자유 강화 계정별 누적 초기화 횟수 — 초기화 비용 단계화(10만→50만→100만→500만→1,000만 상한) 기준.
alter table public.saves_current
  add column if not exists guild_enhance_reset_count integer not null default 0 check (guild_enhance_reset_count >= 0);
