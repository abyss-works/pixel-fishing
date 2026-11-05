-- 길드 보너스 — 보너스별 단계와 다음 단계를 위해 모인 골드, 길드원별 기부 합계. 항해일지에 기부와 단계 상승을 더한다.
-- 읽기·쓰기 정책 없음 = 서버 전용(0027 선례). 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.

-- 보너스 단계 — (길드, 보너스) 한 행. 처음 기부할 때 생긴다. rank는 기부로 오른 단계이고(레벨 도달로 열리는 1단계는
-- 저장하지 않고 서버가 계산한다), pool은 다음 단계 비용을 향해 모인 골드다.
create table public.guild_bonuses (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  bonus text not null check (bonus in ('sell', 'bag', 'named', 'rare', 'mutation')),
  rank smallint not null default 0 check (rank between 0 and 5),
  pool bigint not null default 0 check (pool >= 0),
  primary key (guild_id, bonus)
);
alter table public.guild_bonuses enable row level security;

-- 기부 합계 — (길드, 사람, 보너스) 한 행. 떠나도 남고 돌려주지 않는다.
-- 계정을 지우면 사람 열만 비우고 행은 남긴다(0028 기여 행 선례).
create table public.guild_bonus_donations (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  bonus text not null check (bonus in ('sell', 'bag', 'named', 'rare', 'mutation')),
  gold bigint not null default 0 check (gold >= 0)
);
alter table public.guild_bonus_donations enable row level security;
create unique index guild_bonus_donations_member_idx on public.guild_bonus_donations (guild_id, user_id, bonus);
create index guild_bonus_donations_user_idx on public.guild_bonus_donations (user_id);

-- 항해일지 — 기부(donate: detail 보너스, value 골드)와 단계 상승(bonus-up: detail 보너스, value 새 단계)
alter table public.guild_logs add column value bigint;
alter table public.guild_logs drop constraint guild_logs_kind_check;
alter table public.guild_logs add constraint guild_logs_kind_check
  check (kind in ('join', 'leave', 'kick', 'legendary', 'named', 'donate', 'bonus-up'));
