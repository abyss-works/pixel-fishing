-- 길드 탈퇴·추방·단독 해산 후 20시간 재가입 대기 시각 기록 — 순수 가산 마이그레이션이다.
-- 읽기·쓰기 정책 없음 = 서버 전용.

create table if not exists public.guild_rejoin_cooldowns (
  user_id uuid primary key references auth.users(id) on delete cascade,
  left_at timestamptz not null default now()
);

alter table public.guild_rejoin_cooldowns enable row level security;
