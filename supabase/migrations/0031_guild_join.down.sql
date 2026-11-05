-- 0031 되돌리기 — 가입 신청 표와 길드의 고유 코드, 가입 방식, 권유 문구를 지우고 초대 코드 표를 다시 만든다.
-- 고유 코드는 24시간 초대 코드로 옮기지 않는다. 길드장이 다시 발급한다.
drop table if exists public.guild_join_requests;
create table public.guild_invites (
  guild_id uuid primary key references public.guilds(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null
);
alter table public.guild_invites enable row level security;
drop index if exists public.guilds_code_idx;
alter table public.guilds drop column if exists pitch, drop column if exists join_mode, drop column if exists code;
