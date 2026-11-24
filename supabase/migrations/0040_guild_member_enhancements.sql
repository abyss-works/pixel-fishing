-- 길드원 개인 자유 강화 — 길드·사용자·보너스별 개인 자유 강화 단계(0~5)를 보관한다.
-- 읽기·쓰기 정책 없음 = 서버 전용(0027 선례). 기존 공용 자유 강화 단계는 0으로 되돌린다.
create table public.guild_member_enhancements (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  bonus text not null check (bonus in ('sell', 'bag', 'named', 'rare', 'mutation')),
  rank integer not null default 0 check (rank >= 0 and rank <= 5),
  updated_at timestamptz not null default now(),
  primary key (guild_id, user_id, bonus)
);
alter table public.guild_member_enhancements enable row level security;
create index guild_member_enhancements_user_idx on public.guild_member_enhancements (user_id);

update public.guild_bonuses set enhance_rank = 0 where enhance_rank <> 0;
