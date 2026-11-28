-- 주간 판매골드 랭킹 집계 표와 전체 판매골드 누적 조회 인덱스를 추가한다.
-- 순수 가산 마이그레이션 — 표와 인덱스 추가 후 코드 배포가 안전하다.

create table if not exists public.ranking_weekly_sell_gold (
  week_start date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  gold_earned bigint not null default 0 check (gold_earned >= 0),
  reached_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (week_start, user_id)
);

-- 읽기·쓰기 정책 없음 = 서버 전용
alter table public.ranking_weekly_sell_gold enable row level security;

create index if not exists ranking_weekly_sell_gold_board_idx
  on public.ranking_weekly_sell_gold (week_start, gold_earned desc, reached_at asc, user_id asc);

create index if not exists achievement_counters_sell_gold_board_idx
  on public.achievement_counters (value desc, updated_at asc, user_id asc)
  where key = 'sell.gold';
