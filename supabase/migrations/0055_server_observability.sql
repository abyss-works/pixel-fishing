-- 서버 지연(히스토그램 버킷)·409/4xx·429 사유 및 WebSocket 일별 관측 지표 — 순수 가산 마이그레이션이다.
-- 읽기·쓰기 정책 없음 = 서버 전용.

alter table public.http_metrics_daily
  add column if not exists status_409 bigint not null default 0 check (status_409 >= 0),
  add column if not exists status_4xx bigint not null default 0 check (status_4xx >= 0),
  add column if not exists lat_le_50 bigint not null default 0 check (lat_le_50 >= 0),
  add column if not exists lat_le_100 bigint not null default 0 check (lat_le_100 >= 0),
  add column if not exists lat_le_250 bigint not null default 0 check (lat_le_250 >= 0),
  add column if not exists lat_le_500 bigint not null default 0 check (lat_le_500 >= 0),
  add column if not exists lat_le_1000 bigint not null default 0 check (lat_le_1000 >= 0),
  add column if not exists lat_le_2500 bigint not null default 0 check (lat_le_2500 >= 0),
  add column if not exists lat_gt_2500 bigint not null default 0 check (lat_gt_2500 >= 0),
  add column if not exists lat_sum_ms bigint not null default 0 check (lat_sum_ms >= 0),
  add column if not exists rl_catch_too_soon bigint not null default 0 check (rl_catch_too_soon >= 0),
  add column if not exists rl_letter_gap bigint not null default 0 check (rl_letter_gap >= 0),
  add column if not exists rl_other bigint not null default 0 check (rl_other >= 0);

create table if not exists public.ws_metrics_daily (
  day date primary key,
  upgrades_ok bigint not null default 0 check (upgrades_ok >= 0),
  reject_401 bigint not null default 0 check (reject_401 >= 0),
  reject_403 bigint not null default 0 check (reject_403 >= 0),
  reject_500 bigint not null default 0 check (reject_500 >= 0),
  close_normal bigint not null default 0 check (close_normal >= 0),
  close_abnormal bigint not null default 0 check (close_abnormal >= 0),
  close_idle_timeout bigint not null default 0 check (close_idle_timeout >= 0),
  updated_at timestamptz not null default now()
);

alter table public.ws_metrics_daily enable row level security;
