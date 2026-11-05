-- 길드 성장과 항해일지 — 길드원별 하루 기여와 길드 사건 기록. 누적 기여도와 레벨은 기여 행의 합에서 계산한다.
-- 읽기·쓰기 정책 없음 = 서버 전용(0027 선례). 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.

-- 하루 기여 — (길드, 사람, 게임 날짜) 한 행. fame은 명성으로 쌓은 기여(하루 상한은 서버가 쓸 때 건다),
-- clears는 의뢰 클리어로 쌓은 기여(상한과 별개)다. 떠난 선원의 행도 길드에 남는다.
-- 계정을 지우면 사람 열만 비우고 행은 남긴다 — 길드의 누적 기여도가 줄지 않는다.
create table public.guild_contributions (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  day date not null,
  fame integer not null default 0 check (fame >= 0),
  clears integer not null default 0 check (clears >= 0)
);
alter table public.guild_contributions enable row level security;
create unique index guild_contributions_member_day_idx on public.guild_contributions (guild_id, user_id, day);
create index guild_contributions_user_idx on public.guild_contributions (user_id);

-- 항해일지 — 길드에 남는 사건(가입·떠남·내보냄·전설 획득·네임드 토벌). detail은 어종 id나 의뢰 id다.
-- 계정을 지우면 그 사람의 기록을 지운다.
create table public.guild_logs (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('join', 'leave', 'kick', 'legendary', 'named')),
  detail text,
  created_at timestamptz not null default now()
);
alter table public.guild_logs enable row level security;
create index guild_logs_guild_idx on public.guild_logs (guild_id, id desc);
create index guild_logs_user_idx on public.guild_logs (user_id);
