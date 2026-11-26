-- 주간 명성 랭킹 집계 표와 네임드 토벌 주간 조회 인덱스를 추가한다.
-- 순수 가산 마이그레이션 — 표와 인덱스 추가 후 코드 배포가 안전하다.

create table if not exists public.ranking_weekly_fame (
  week_start date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  fame_gained bigint not null default 0 check (fame_gained >= 0),
  reached_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (week_start, user_id)
);

-- 읽기·쓰기 정책 없음 = 서버 전용
alter table public.ranking_weekly_fame enable row level security;

create index if not exists ranking_weekly_fame_board_idx
  on public.ranking_weekly_fame (week_start, fame_gained desc, reached_at asc, user_id asc);

create index if not exists bounty_clears_kind_cleared_at_idx
  on public.bounty_clears (kind, cleared_at)
  where kind = 'named';
